import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { RequirementAnswersService } from '../requirement-answers/requirement-answers.service';
import { WaterPlansService } from './water-plans.service';
import { EPA_PRIORITY_MARK, WATER_FRAMEWORK_ID } from './water-program.constants';
import { cadenceOf, WaterTabletopService, type TabletopCadence } from './water-tabletop.service';

export interface ReportQuestion {
  identifier: string;
  question: string;
  function: string;
  priority: boolean;
  /** CPG 2.0 goal the question is tied to. */
  goal: string;
  answer: string | null;
  note: string | null;
  justification: string | null;
  answeredAt: string | null;
  /** The goal's evidence task: where the fix and the proof are recorded. */
  evidence: { status: string; owner: string | null; attachments: number } | null;
}

export interface WaterReport {
  utility: string;
  framework: string;
  generatedAt: string;
  answered: number;
  expected: number;
  functions: Array<{ label: string; yes: number; inProgress: number; no: number; notApplicable: number; unanswered: number; percent: number }>;
  questions: ReportQuestion[];
  plans: Array<{ name: string; status: string; written: number; total: number }>;
  tabletop: {
    cadence: TabletopCadence;
    session: {
      title: string;
      scenario: string | null;
      heldOn: string | null;
      facilitator: string | null;
      participants: string | null;
      afterAction: string | null;
      topics: Array<{ title: string; discussion: string; gaps: string | null }>;
    } | null;
  };
}

/** Everything the printable water report needs, in one read. */
@Injectable()
export class WaterReportService {
  constructor(
    private readonly answers: RequirementAnswersService,
    private readonly plans: WaterPlansService,
    private readonly tabletop: WaterTabletopService,
  ) {}

  async getReport(frameworkInstanceId: string, organizationId: string): Promise<WaterReport> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { framework: { select: { name: true } }, organization: { select: { name: true } } },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');

    const [requirements, answerRows, results, links, plans, topics, sessions] = await Promise.all([
      db.frameworkEditorRequirement.findMany({
        where: { frameworkId: WATER_FRAMEWORK_ID },
        select: {
          id: true,
          identifier: true,
          name: true,
          description: true,
          requirementFamily: true,
          sortOrder: true,
          controlTemplates: { select: { id: true, name: true } },
        },
      }),
      db.requirementAnswer.findMany({
        where: { frameworkInstanceId, organizationId },
        select: { requirementId: true, answer: true, comment: true, justification: true, answeredAt: true },
      }),
      this.answers.getResults(frameworkInstanceId, organizationId),
      db.frameworkEditorControlTaskTemplateLink.findMany({
        where: { frameworkId: WATER_FRAMEWORK_ID, taskTemplate: { name: { startsWith: 'Evidence:' } } },
        select: { taskTemplateId: true, controlTemplateId: true },
      }),
      this.plans.getPlans(frameworkInstanceId, organizationId),
      this.tabletop.interviewTasks(organizationId),
      this.tabletop.sessions(frameworkInstanceId, organizationId),
    ]);

    const tasks = await db.task.findMany({
      where: { organizationId, taskTemplateId: { in: links.map((l) => l.taskTemplateId) } },
      select: { id: true, status: true, taskTemplateId: true, assignee: { select: { user: { select: { name: true } } } } },
    });
    const counts = await db.attachment.groupBy({
      by: ['entityId'],
      where: { organizationId, entityType: 'task', entityId: { in: tasks.map((t) => t.id) } },
      _count: { _all: true },
    });
    const attachments = new Map(counts.map((c) => [c.entityId, c._count._all]));
    const taskByTemplate = new Map(tasks.map((t) => [t.taskTemplateId, t]));
    const taskByControl = new Map(links.map((l) => [l.controlTemplateId, taskByTemplate.get(l.taskTemplateId)]));
    const answerByReq = new Map(answerRows.map((a) => [a.requirementId, a]));

    const questions: ReportQuestion[] = [...requirements]
      .sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.identifier.localeCompare(b.identifier))
      .map((r) => {
        const a = answerByReq.get(r.id);
        const control = r.controlTemplates[0];
        const task = control ? taskByControl.get(control.id) : undefined;
        return {
          identifier: r.identifier,
          question: r.name.replace(/^\S+\s/, ''),
          function: r.requirementFamily ?? 'Other',
          priority: r.description.includes(EPA_PRIORITY_MARK),
          goal: control?.name ?? '',
          answer: a?.answer ?? null,
          note: a?.comment ?? null,
          justification: a?.justification ?? null,
          answeredAt: a?.answeredAt ? a.answeredAt.toISOString().slice(0, 10) : null,
          evidence: task
            ? { status: task.status, owner: task.assignee?.user?.name ?? null, attachments: attachments.get(task.id) ?? 0 }
            : null,
        };
      });

    const held = sessions
      .filter((s) => s.status === 'held' && s.heldOn)
      .sort((a, b) => (b.heldOn as Date).getTime() - (a.heldOn as Date).getTime())[0];
    const topicTitle = new Map(topics.map((t) => [t.id, t.title.replace(/^Interview evidence: /, '')]));
    const notes = (Array.isArray(held?.notes) ? held.notes : []) as unknown as Array<{ taskId: string; discussion: string; gaps?: string }>;

    return {
      utility: instance.organization.name,
      framework: instance.framework?.name ?? 'Water framework',
      generatedAt: new Date().toISOString(),
      answered: results.answered,
      expected: results.expected,
      functions: results.families.map((f) => ({
        label: f.label,
        yes: f.counts.yes,
        inProgress: f.counts.incomplete,
        no: f.counts.no,
        notApplicable: f.counts.not_applicable,
        unanswered: f.counts.unanswered,
        percent: f.percent,
      })),
      questions,
      plans: plans.map((p) => ({ name: p.name, status: p.status, written: p.written, total: p.total })),
      tabletop: {
        cadence: cadenceOf(sessions),
        session: held
          ? {
              title: held.title,
              scenario: held.scenario,
              heldOn: held.heldOn?.toISOString().slice(0, 10) ?? null,
              facilitator: held.facilitator,
              participants: held.participants,
              afterAction: held.afterAction,
              topics: notes.map((n) => ({ title: topicTitle.get(n.taskId) ?? n.taskId, discussion: n.discussion, gaps: n.gaps ?? null })),
            }
          : null,
      },
    };
  }
}
