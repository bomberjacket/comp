import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { Prisma } from '@db';
import type { SaveTabletopDto } from './dto/save-tabletop.dto';
import { INTERVIEW_TASK_PREFIX, WATER_FRAMEWORK_ID } from './water-program.constants';

export interface TabletopNote {
  taskId: string;
  discussion: string;
  gaps?: string;
}

export interface TabletopTopic {
  taskId: string;
  title: string;
  status: string;
  /** Question groups parsed from the interview task: a heading and its questions. */
  groups: Array<{ heading: string; questions: string[] }>;
}

export interface TabletopSessionView {
  id: string;
  title: string;
  scenario: string | null;
  status: 'planned' | 'held';
  scheduledFor: string | null;
  heldOn: string | null;
  facilitator: string | null;
  participants: string | null;
  cadenceMonths: number;
  notes: TabletopNote[];
  afterAction: string | null;
}

export interface TabletopCadence {
  cadenceMonths: number;
  lastHeldOn: string | null;
  nextDue: string | null;
  overdue: boolean;
}

export interface TabletopView {
  cadence: TabletopCadence;
  topics: TabletopTopic[];
  sessions: TabletopSessionView[];
}

const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

function addMonths(d: Date, months: number): Date {
  const next = new Date(d);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** "Section:\n- question" blocks of an interview task description. */
export function parseInterviewGroups(description: string | null): TabletopTopic['groups'] {
  const groups: TabletopTopic['groups'] = [];
  for (const raw of (description ?? '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      if (!groups.length) groups.push({ heading: 'Questions', questions: [] });
      groups[groups.length - 1].questions.push(line.slice(2));
    } else if (line.endsWith(':') && line.length < 120) {
      groups.push({ heading: line.slice(0, -1), questions: [] });
    }
  }
  return groups.filter((g) => g.questions.length > 0);
}

export function cadenceOf(sessions: Array<{ status: string; heldOn: Date | null; cadenceMonths: number }>, now = new Date()): TabletopCadence {
  const held = sessions
    .filter((s) => s.status === 'held' && s.heldOn)
    .sort((a, b) => (b.heldOn as Date).getTime() - (a.heldOn as Date).getTime());
  const last = held[0];
  if (!last?.heldOn) return { cadenceMonths: sessions[0]?.cadenceMonths ?? 12, lastHeldOn: null, nextDue: null, overdue: false };
  const due = addMonths(last.heldOn, last.cadenceMonths);
  return { cadenceMonths: last.cadenceMonths, lastHeldOn: day(last.heldOn), nextDue: day(due), overdue: due.getTime() < now.getTime() };
}

@Injectable()
export class WaterTabletopService {
  private async assertInstance(frameworkInstanceId: string, organizationId: string): Promise<void> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
  }

  /** Interview tasks of the organization: one tabletop topic per CPG goal. */
  async interviewTasks(organizationId: string) {
    const links = await db.frameworkEditorControlTaskTemplateLink.findMany({
      where: { frameworkId: WATER_FRAMEWORK_ID, taskTemplate: { name: { startsWith: INTERVIEW_TASK_PREFIX } } },
      select: { taskTemplateId: true },
    });
    return db.task.findMany({
      where: { organizationId, taskTemplateId: { in: links.map((l) => l.taskTemplateId) } },
      select: { id: true, title: true, description: true, status: true },
      orderBy: { title: 'asc' },
    });
  }

  private toView(s: {
    id: string;
    title: string;
    scenario: string | null;
    status: string;
    scheduledFor: Date | null;
    heldOn: Date | null;
    facilitator: string | null;
    participants: string | null;
    cadenceMonths: number;
    notes: Prisma.JsonValue;
    afterAction: string | null;
  }): TabletopSessionView {
    return {
      id: s.id,
      title: s.title,
      scenario: s.scenario,
      status: s.status as 'planned' | 'held',
      scheduledFor: day(s.scheduledFor),
      heldOn: day(s.heldOn),
      facilitator: s.facilitator,
      participants: s.participants,
      cadenceMonths: s.cadenceMonths,
      notes: (Array.isArray(s.notes) ? s.notes : []) as unknown as TabletopNote[],
      afterAction: s.afterAction,
    };
  }

  async sessions(frameworkInstanceId: string, organizationId: string) {
    return db.tabletopSession.findMany({
      where: { frameworkInstanceId, organizationId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getTabletop(frameworkInstanceId: string, organizationId: string): Promise<TabletopView> {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const [tasks, sessions] = await Promise.all([
      this.interviewTasks(organizationId),
      this.sessions(frameworkInstanceId, organizationId),
    ]);
    return {
      cadence: cadenceOf(sessions),
      topics: tasks.map((t) => ({
        taskId: t.id,
        title: t.title.replace(`${INTERVIEW_TASK_PREFIX} `, ''),
        status: t.status,
        groups: parseInterviewGroups(t.description),
      })),
      sessions: sessions.map((s) => this.toView(s)),
    };
  }

  /**
   * Create (no sessionId) or update a session. Recording it as held needs the date, and
   * moves the interview task of every topic with a recorded discussion to done.
   */
  async saveSession(args: {
    frameworkInstanceId: string;
    organizationId: string;
    sessionId?: string;
    dto: SaveTabletopDto;
  }): Promise<TabletopView> {
    const { frameworkInstanceId, organizationId, sessionId, dto } = args;
    await this.assertInstance(frameworkInstanceId, organizationId);
    if (dto.status === 'held' && !dto.heldOn) throw new BadRequestException('A held session needs the date it was held');
    const tasks = await this.interviewTasks(organizationId);
    const known = new Set(tasks.map((t) => t.id));
    const notes = dto.notes
      .map((n) => ({ taskId: n.taskId, discussion: n.discussion.trim(), gaps: n.gaps?.trim() || undefined }))
      .filter((n) => n.discussion || n.gaps);
    const stray = notes.find((n) => !known.has(n.taskId));
    if (stray) throw new BadRequestException(`Task ${stray.taskId} is not an interview task of this organization`);
    const data = {
      title: dto.title.trim(),
      scenario: dto.scenario?.trim() || null,
      status: dto.status,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
      heldOn: dto.heldOn ? new Date(dto.heldOn) : null,
      facilitator: dto.facilitator?.trim() || null,
      participants: dto.participants?.trim() || null,
      cadenceMonths: dto.cadenceMonths,
      notes: notes as unknown as Prisma.InputJsonValue,
      afterAction: dto.afterAction?.trim() || null,
    };
    if (sessionId) {
      const existing = await db.tabletopSession.findFirst({ where: { id: sessionId, frameworkInstanceId, organizationId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Tabletop session not found');
      await db.tabletopSession.update({ where: { id: sessionId }, data });
    } else {
      await db.tabletopSession.create({ data: { ...data, organizationId, frameworkInstanceId } });
    }
    if (dto.status === 'held') {
      const covered = new Set(notes.filter((n) => n.discussion).map((n) => n.taskId));
      for (const t of tasks) {
        if (!covered.has(t.id) || t.status === 'done' || t.status === 'in_review' || t.status === 'not_relevant') continue;
        await db.task.update({ where: { id: t.id }, data: { status: 'done', lastCompletedAt: new Date(dto.heldOn as string) } });
      }
    }
    return this.getTabletop(frameworkInstanceId, organizationId);
  }

  async deleteSession(frameworkInstanceId: string, organizationId: string, sessionId: string): Promise<TabletopView> {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const res = await db.tabletopSession.deleteMany({ where: { id: sessionId, frameworkInstanceId, organizationId } });
    if (res.count === 0) throw new NotFoundException('Tabletop session not found');
    return this.getTabletop(frameworkInstanceId, organizationId);
  }
}
