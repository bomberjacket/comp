import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { RequirementAnswersService } from '../requirement-answers/requirement-answers.service';
import { VENDOR_CHECKLISTS, type VendorChecklistKind } from '../vendor-checklists/checklists.generated';
import { scoreChecklist, type ChecklistItemAnswer } from '../vendor-checklists/vendor-checklists.service';
import { PLAN_SECTIONS } from './plan-sections.generated';
import { readPlanSections, type TipTapNode } from './plan-writer';
import {
  EPA_PRIORITY_MARK,
  WATER_FRAMEWORK_ID,
  WATER_PLAN_TEMPLATES,
} from './water-program.constants';
import { cadenceOf, WaterTabletopService } from './water-tabletop.service';

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export interface StepDetail {
  label: string;
  status: string;
  /** app path under /<orgId>/ */
  href?: string;
}

export interface WaterProgramStep {
  key: 'plans' | 'assess' | 'gaps' | 'evidence' | 'vendors' | 'tabletop';
  title: string;
  description: string;
  status: StepStatus;
  done: number;
  total: number;
  summary: string;
  href: string;
  details: StepDetail[];
}

export interface WaterProgram {
  frameworkInstanceId: string;
  frameworkName: string;
  steps: WaterProgramStep[];
}

function statusOf(done: number, total: number, started = done > 0): StepStatus {
  if (total > 0 && done >= total) return 'done';
  return started ? 'in_progress' : 'not_started';
}

/** How much of the requested information a plan policy carries: fill-in boxes with a value. */
function sectionsWritten(content: unknown, key: 'crmp' | 'cirp'): { written: number; total: number } {
  const sections = readPlanSections(
    (Array.isArray(content) ? content : []) as TipTapNode[],
    PLAN_SECTIONS[key].sections,
  );
  return { written: sections.reduce((n, s) => n + s.filled, 0), total: sections.reduce((n, s) => n + s.fields.length, 0) };
}

@Injectable()
export class WaterProgramService {
  constructor(
    private readonly answers: RequirementAnswersService,
    private readonly tabletop: WaterTabletopService,
  ) {}

  async getProgram(frameworkInstanceId: string, organizationId: string): Promise<WaterProgram> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true, framework: { select: { name: true } } },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
    // Order: policies and plans first, then implementation status, fixes, operational
    // evidence, third parties; the tabletop validates the program on a cadence, last.
    const [plans, assess, gaps, evidence, vendors, tabletop] = await Promise.all([
      this.plansStep(organizationId),
      this.assessStep(frameworkInstanceId, organizationId),
      this.gapsStep(frameworkInstanceId, organizationId),
      this.evidenceStep(organizationId),
      this.vendorsStep(organizationId),
      this.tabletopStep(frameworkInstanceId, organizationId),
    ]);
    return {
      frameworkInstanceId,
      frameworkName: instance.framework?.name ?? 'Water framework',
      steps: [plans, assess, gaps, evidence, vendors, tabletop],
    };
  }

  private async assessStep(instanceId: string, organizationId: string): Promise<WaterProgramStep> {
    const results = await this.answers.getResults(instanceId, organizationId);
    const { answered, expected } = results;
    return {
      key: 'assess',
      title: 'Record implementation status with the EPA checklist',
      description: "EPA's 33 questions for drinking water and wastewater systems, each tied to a CISA CPG 2.0 goal, answered against what the plans say and what is configured today. Yes, In progress, No or Not applicable; unknown counts as No.",
      status: statusOf(answered, expected),
      done: answered,
      total: expected,
      summary: `${answered} of ${expected} questions answered`,
      href: `frameworks/${instanceId}?tab=assess`,
      details: [],
    };
  }

  private async gapsStep(instanceId: string, organizationId: string): Promise<WaterProgramStep> {
    const rows = await db.requirementAnswer.findMany({
      where: { frameworkInstanceId: instanceId, organizationId, answer: { in: ['no', 'incomplete'] } },
      select: { answer: true, requirement: { select: { identifier: true, name: true, description: true } } },
    });
    const gaps = rows
      .filter((r) => r.requirement)
      .map((r) => ({
        identifier: r.requirement?.identifier ?? '',
        name: r.requirement?.name ?? '',
        priority: (r.requirement?.description ?? '').includes(EPA_PRIORITY_MARK),
        answer: r.answer,
      }))
      .sort((a, b) => Number(b.priority) - Number(a.priority) || a.identifier.localeCompare(b.identifier));
    const priority = gaps.filter((g) => g.priority).length;
    const answered = await db.requirementAnswer.count({ where: { frameworkInstanceId: instanceId, organizationId } });
    return {
      key: 'gaps',
      title: 'Configure and fix the gaps, EPA priority practices first',
      description: 'Every No or In progress is a gap to close by configuration or procedure. The evidence task of its CPG goal is where the fix is recorded; the Results tab shows the picture by function.',
      status: answered === 0 ? 'not_started' : gaps.length === 0 ? 'done' : 'in_progress',
      done: Math.max(answered - gaps.length, 0),
      total: answered,
      summary: answered === 0 ? 'Answer the checklist first' : `${gaps.length} gaps, ${priority} on EPA priority practices`,
      href: `frameworks/${instanceId}?tab=results`,
      details: gaps.slice(0, 20).map((g) => ({
        label: `${g.identifier} ${g.name.replace(/^\S+\s/, '')}${g.priority ? ' (EPA priority)' : ''}`,
        status: g.answer === 'no' ? 'No' : 'In progress',
        href: `frameworks/${instanceId}?tab=assess`,
      })),
    };
  }

  private async plansStep(organizationId: string): Promise<WaterProgramStep> {
    const policies = await db.policy.findMany({
      where: { organizationId, isArchived: false, policyTemplateId: { in: WATER_PLAN_TEMPLATES.map((p) => p.id) } },
      select: { id: true, name: true, status: true, content: true, policyTemplateId: true },
    });
    const details: StepDetail[] = [];
    let done = 0;
    for (const plan of WATER_PLAN_TEMPLATES) {
      const policy = policies.find((p) => p.policyTemplateId === plan.id);
      if (!policy) {
        details.push({ label: plan.label, status: 'Not created (add the framework)' });
        continue;
      }
      const { written, total } = sectionsWritten(policy.content, plan.key);
      // Publishing is the utility's call; how complete the plan is shows beside it.
      if (policy.status === 'published') done += 1;
      const percent = total > 0 ? Math.round((written / total) * 100) : 0;
      const state = policy.status === 'published' ? 'Published' : policy.status === 'needs_review' ? 'In review' : 'Draft';
      details.push({
        label: plan.label,
        status: `${state}, ${percent}% of the requested information filled in (${written} of ${total})`,
        href: `policies/${policy.id}`,
      });
    }
    const started = policies.some((p) => {
      const plan = WATER_PLAN_TEMPLATES.find((t) => t.id === p.policyTemplateId);
      return p.status !== 'draft' || (plan ? sectionsWritten(p.content, plan.key).written > 0 : false);
    });
    return {
      key: 'plans',
      title: 'Write the policies: the two plans',
      description: 'Start with the documents the rest of the program points to. The Cybersecurity Risk Management Plan and the Cyber Incident Response Plan follow the AWWA section order with standard wording under each heading; fill in the utility\'s own facts for each section, then publish. A plan can be published with boxes left empty; the guide shows how complete it is.',
      status: statusOf(done, WATER_PLAN_TEMPLATES.length, started),
      done,
      total: WATER_PLAN_TEMPLATES.length,
      summary: `${done} of ${WATER_PLAN_TEMPLATES.length} plans published`,
      href: 'policies',
      details,
    };
  }

  private async vendorsStep(organizationId: string): Promise<WaterProgramStep> {
    const [vendors, sheets] = await Promise.all([
      db.vendor.findMany({ where: { organizationId }, select: { id: true, name: true } }),
      db.vendorChecklistAssessment.findMany({ where: { organizationId }, select: { vendorId: true, kind: true, items: true } }),
    ]);
    const assessed = new Set(sheets.map((s) => s.vendorId));
    const details: StepDetail[] = vendors.slice(0, 25).map((v) => {
      const mine = sheets.filter((s) => s.vendorId === v.id);
      const scores = mine.map((s) => {
        const kind = s.kind as VendorChecklistKind;
        const r = scoreChecklist(VENDOR_CHECKLISTS[kind], (Array.isArray(s.items) ? s.items : []) as unknown as ChecklistItemAnswer[]);
        return `${kind === 'epa_supplier' ? 'supplier' : 'integrator/MSP'} ${r.percent ?? 0}%`;
      });
      return { label: v.name, status: scores.length ? scores.join(', ') : 'Not scored', href: `vendors/${v.id}?tab=procurement` };
    });
    return {
      key: 'vendors',
      title: 'Score suppliers and integrators',
      description: "EPA's procurement checklist on each vendor record: the supplier sheet for products and services, the integrator sheet for system integrators and managed service providers. Weight what matters to the utility, score the responses, note what goes into the contract.",
      status: statusOf(assessed.size, vendors.length),
      done: assessed.size,
      total: vendors.length,
      summary: vendors.length === 0 ? 'No vendors recorded yet' : `${assessed.size} of ${vendors.length} vendors scored`,
      href: 'vendors',
      details,
    };
  }

  private async evidenceStep(organizationId: string): Promise<WaterProgramStep> {
    const links = await db.frameworkEditorControlTaskTemplateLink.findMany({
      where: { frameworkId: WATER_FRAMEWORK_ID, taskTemplate: { name: { startsWith: 'Evidence:' } } },
      select: { taskTemplateId: true },
    });
    const tasks = await db.task.findMany({
      where: { organizationId, taskTemplateId: { in: links.map((l) => l.taskTemplateId) } },
      select: { id: true, title: true, status: true },
      orderBy: { title: 'asc' },
    });
    const done = tasks.filter((t) => t.status === 'done').length;
    return {
      key: 'evidence',
      title: 'Collect the operational evidence',
      description: 'One evidence task per CPG 2.0 goal: inventories, configuration exports, logs, training records, backup tests. Attach the artefact that shows the practice is running; a Yes on the checklist moves the task to done, and the evidence keeps it there.',
      status: statusOf(done, tasks.length, tasks.some((t) => t.status !== 'todo')),
      done,
      total: tasks.length,
      summary: `${done} of ${tasks.length} evidence tasks done`,
      href: 'tasks',
      details: tasks.map((t) => ({ label: t.title.replace(/^Evidence: /, ''), status: t.status.replace('_', ' '), href: `tasks/${t.id}` })),
    };
  }

  private async tabletopStep(instanceId: string, organizationId: string): Promise<WaterProgramStep> {
    const [tasks, sessions] = await Promise.all([
      this.tabletop.interviewTasks(organizationId),
      this.tabletop.sessions(instanceId, organizationId),
    ]);
    const done = tasks.filter((t) => t.status === 'done').length;
    const cadence = cadenceOf(sessions);
    const planned = sessions.filter((s) => s.status === 'planned');
    const current = !!cadence.lastHeldOn && !cadence.overdue;
    const summary = cadence.lastHeldOn
      ? `Last held ${cadence.lastHeldOn}, next due ${cadence.nextDue}${cadence.overdue ? ' (overdue)' : ''}`
      : planned.length
        ? 'A session is planned, none held yet'
        : 'No tabletop session held yet';
    return {
      key: 'tabletop',
      title: 'Validate with a tabletop, on a cadence',
      description: "Once the program is in place, exercise it at least yearly. A session walks the CISA water-sector tabletop questions, one topic per CPG goal, with the people who own each practice. Record who met, what was said and the after-action summary; the next session comes due on the cadence set here.",
      status: current ? 'done' : sessions.length > 0 || tasks.some((t) => t.status !== 'todo') ? 'in_progress' : 'not_started',
      done,
      total: tasks.length,
      summary: `${summary}; ${done} of ${tasks.length} topics covered`,
      href: `tasks?framework=${instanceId}`,
      details: [
        ...sessions.map((s) => ({
          label: s.title,
          status: s.status === 'held' ? `Held ${s.heldOn?.toISOString().slice(0, 10) ?? ''}` : `Planned${s.scheduledFor ? ` for ${s.scheduledFor.toISOString().slice(0, 10)}` : ''}`,
        })),
        ...tasks.map((t) => ({ label: t.title, status: t.status.replace('_', ' '), href: `tasks/${t.id}` })),
      ],
    };
  }
}
