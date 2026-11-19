import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { goalEvidencePlan, goalIdOf, type EvidenceSource, type SystemEvidenceInputs, type SystemEvidenceItem } from './system-evidence';
import { WaterPlansService } from './water-plans.service';
import { WATER_FRAMEWORK_ID } from './water-program.constants';
import { cadenceOf, WaterTabletopService } from './water-tabletop.service';

export interface EvidenceTaskView {
  taskId: string;
  title: string;
  /** Paragraphs of the task description: what to collect and why. */
  description: string[];
  status: string;
  attachments: number;
  /** EPA checklist questions answered under the same CPG goal, with the current answer. */
  questions: Array<{ identifier: string; name: string; answer: string | null }>;
  /** Who supplies the evidence today: the platform from its own records, or the utility. */
  source: EvidenceSource;
  /** For a system goal: each record that counts, and whether the platform holds it. */
  system: SystemEvidenceItem[];
  /** Every system record is present. */
  systemComplete: boolean;
  /** A way the platform could supply this later; not built yet. */
  planned?: string;
  /** When (ISO timestamp) the status last changed; null when it has not changed since this was first recorded. */
  statusChangedOn: string | null;
  /** Date new evidence is next due: the completion date plus the task's cycle. Null until the task is done. */
  nextDueOn: string | null;
  /** The task's cycle, for example quarterly. */
  cycle: string | null;
  /** A goal the utility supplies, answered Yes on the checklist or marked done, with nothing attached. */
  evidenceMissing: boolean;
}

/** Full timestamps, so the browser shows the date in the reader's own time zone. */
const day = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Completion date plus one cycle, as the upstream task screens calculate the next review. */
function nextDue(completed: Date | null, frequency: string | null): Date | null {
  if (!completed || !frequency) return null;
  const d = new Date(completed);
  if (frequency === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else return null;
  return d;
}

export interface EvidenceView {
  summary: {
    systemGoals: number;
    systemComplete: number;
    yourGoals: number;
    yourDone: number;
    plannedGoals: number;
  };
  tasks: EvidenceTaskView[];
}

@Injectable()
export class WaterEvidenceService {
  constructor(
    private readonly plans: WaterPlansService,
    private readonly tabletop: WaterTabletopService,
  ) {}

  /** Evidence tasks of the water framework: one per CPG 2.0 goal. */
  async evidenceTasks(organizationId: string) {
    const links = await db.frameworkEditorControlTaskTemplateLink.findMany({
      where: { frameworkId: WATER_FRAMEWORK_ID, taskTemplate: { name: { startsWith: 'Evidence:' } } },
      select: { taskTemplateId: true, controlTemplateId: true },
    });
    const tasks = await db.task.findMany({
      where: { organizationId, taskTemplateId: { in: links.map((l) => l.taskTemplateId) } },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        taskTemplateId: true,
        frequency: true,
        lastCompletedAt: true,
        reviewDate: true,
        statusChangedAt: true,
      },
      orderBy: { title: 'asc' },
    });
    return { links, tasks };
  }

  /** The platform's own records that count as evidence: plans, vendor sheets, tabletops, training. */
  private async systemInputs(frameworkInstanceId: string, organizationId: string): Promise<SystemEvidenceInputs> {
    const [plans, vendors, sheets, sessions, members, trained] = await Promise.all([
      this.plans.getPlans(frameworkInstanceId, organizationId),
      db.vendor.count({ where: { organizationId } }),
      db.vendorChecklistAssessment.findMany({ where: { organizationId }, select: { vendorId: true, kind: true } }),
      this.tabletop.sessions(frameworkInstanceId, organizationId),
      db.member.count({ where: { organizationId, isActive: true } }),
      db.employeeTrainingVideoCompletion.findMany({
        where: { completedAt: { not: null }, member: { organizationId, isActive: true } },
        select: { memberId: true },
        distinct: ['memberId'],
      }),
    ]);
    return {
      plans,
      vendors,
      vendorsScored: new Set(sheets.map((s) => s.vendorId)).size,
      integratorSheets: sheets.filter((s) => s.kind === 'epa_integrator_msp').length,
      cadence: cadenceOf(sessions),
      members,
      membersTrained: trained.length,
    };
  }

  async getEvidence(frameworkInstanceId: string, organizationId: string): Promise<EvidenceView> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
    const { links, tasks } = await this.evidenceTasks(organizationId);
    const controlByTemplate = new Map(links.map((l) => [l.taskTemplateId, l.controlTemplateId]));
    const [counts, controls, answers, inputs] = await Promise.all([
      db.attachment.groupBy({
        by: ['entityId'],
        where: { organizationId, entityType: 'task', entityId: { in: tasks.map((t) => t.id) } },
        _count: { _all: true },
      }),
      db.frameworkEditorControlTemplate.findMany({
        where: { id: { in: links.map((l) => l.controlTemplateId) } },
        select: {
          id: true,
          requirements: { where: { frameworkId: WATER_FRAMEWORK_ID }, select: { id: true, identifier: true, name: true, sortOrder: true } },
        },
      }),
      db.requirementAnswer.findMany({
        where: { frameworkInstanceId, organizationId },
        select: { requirementId: true, answer: true },
      }),
      this.systemInputs(frameworkInstanceId, organizationId),
    ]);
    const countByTask = new Map(counts.map((c) => [c.entityId, c._count._all]));
    const answerByReq = new Map(answers.map((a) => [a.requirementId, a.answer as string]));
    const reqsByControl = new Map(controls.map((c) => [c.id, c.requirements]));
    const views: EvidenceTaskView[] = tasks.map((t) => {
      const reqs = reqsByControl.get(controlByTemplate.get(t.taskTemplateId ?? '') ?? '') ?? [];
      const title = t.title.replace(/^Evidence: /, '');
      const plan = goalEvidencePlan(goalIdOf(title), inputs);
      const attachments = countByTask.get(t.id) ?? 0;
      const answeredYes = reqs.some((r) => ['yes', 'alternate'].includes(answerByReq.get(r.id) ?? ''));
      return {
        taskId: t.id,
        title,
        description: (t.description ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        status: t.status,
        attachments,
        evidenceMissing: plan.source === 'you' && attachments === 0 && (t.status === 'done' || answeredYes),
        questions: [...reqs]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((r) => ({ identifier: r.identifier, name: r.name, answer: answerByReq.get(r.id) ?? null })),
        source: plan.source,
        system: plan.system,
        systemComplete: plan.source === 'system' && plan.system.every((i) => i.provided),
        ...(plan.planned ? { planned: plan.planned } : {}),
        statusChangedOn: day(t.statusChangedAt),
        nextDueOn: t.status === 'done' ? day(t.reviewDate ?? nextDue(t.lastCompletedAt ?? t.statusChangedAt, t.frequency)) : null,
        cycle: t.frequency,
      };
    });
    const mine = views.filter((v) => v.source === 'you');
    const system = views.filter((v) => v.source === 'system');
    return {
      summary: {
        systemGoals: system.length,
        systemComplete: system.filter((v) => v.systemComplete).length,
        yourGoals: mine.length,
        yourDone: mine.filter((v) => v.status === 'done').length,
        plannedGoals: mine.filter((v) => v.planned).length,
      },
      tasks: views,
    };
  }

  /**
   * Mark a goal's evidence task done when its evidence is there: for a platform goal,
   * every record that counts; for a goal the utility supplies, at least one attached
   * file. Never moves a task backwards, never touches one in review, and leaves a goal
   * alone while its checklist answer is No or In progress: the answer says it is not met.
   */
  async syncSystemEvidence(frameworkInstanceId: string, organizationId: string): Promise<EvidenceView> {
    const view = await this.getEvidence(frameworkInstanceId, organizationId);
    let changed = false;
    for (const t of view.tasks) {
      const evidenced = t.source === 'system' ? t.systemComplete : t.attachments > 0;
      if (!evidenced || !['todo', 'in_progress'].includes(t.status)) continue;
      if (t.questions.some((q) => q.answer === 'no' || q.answer === 'incomplete')) continue;
      await db.task.update({ where: { id: t.taskId }, data: { status: 'done', lastCompletedAt: new Date() } });
      changed = true;
    }
    return changed ? this.getEvidence(frameworkInstanceId, organizationId) : view;
  }
}
