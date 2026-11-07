import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { RequirementAnswersService } from '../requirement-answers/requirement-answers.service';
import { VENDOR_CHECKLISTS, type VendorChecklistKind } from '../vendor-checklists/checklists.generated';
import { scoreChecklist, type ChecklistItemAnswer } from '../vendor-checklists/vendor-checklists.service';
import {
  EPA_PRIORITY_MARK,
  INTERVIEW_TASK_PREFIX,
  PLAN_PROMPT_TEXT,
  WATER_FRAMEWORK_ID,
  WATER_PLAN_TEMPLATES,
} from './water-program.constants';

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export interface StepDetail {
  label: string;
  status: string;
  /** app path under /<orgId>/ */
  href?: string;
}

export interface WaterProgramStep {
  key: 'assess' | 'gaps' | 'plans' | 'vendors' | 'tabletop';
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

function countPrompts(content: unknown): number {
  let n = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as { type?: string; text?: string; content?: unknown };
    if (obj.type === 'text' && obj.text === PLAN_PROMPT_TEXT) n += 1;
    if (obj.content) walk(obj.content);
  };
  walk(content);
  return n;
}

@Injectable()
export class WaterProgramService {
  constructor(private readonly answers: RequirementAnswersService) {}

  async getProgram(frameworkInstanceId: string, organizationId: string): Promise<WaterProgram> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true, framework: { select: { name: true } } },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
    const [assess, gaps, plans, vendors, tabletop] = await Promise.all([
      this.assessStep(frameworkInstanceId, organizationId),
      this.gapsStep(frameworkInstanceId, organizationId),
      this.plansStep(organizationId),
      this.vendorsStep(organizationId),
      this.tabletopStep(frameworkInstanceId, organizationId),
    ]);
    return { frameworkInstanceId, frameworkName: instance.framework?.name ?? 'Water framework', steps: [assess, gaps, plans, vendors, tabletop] };
  }

  private async assessStep(instanceId: string, organizationId: string): Promise<WaterProgramStep> {
    const results = await this.answers.getResults(instanceId, organizationId);
    const { answered, expected } = results;
    return {
      key: 'assess',
      title: 'Answer the EPA checklist',
      description: "EPA's 33 questions for drinking water and wastewater systems, each tied to a CISA CPG 2.0 goal. Answer Yes, In progress, No or Not applicable; unknown counts as No.",
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
      title: 'Work the gaps, EPA priority practices first',
      description: 'Every No or In progress is a gap. The evidence task of its CPG goal is where the fix is recorded; the Results tab shows the picture by function.',
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
      const prompts = countPrompts(policy.content);
      const complete = policy.status === 'published' && prompts === 0;
      if (complete) done += 1;
      const state = policy.status === 'published' ? 'Published' : policy.status === 'needs_review' ? 'In review' : 'Draft';
      details.push({
        label: plan.label,
        status: prompts > 0 ? `${state}, ${prompts} sections still carry the prompt` : state,
        href: `policies/${policy.id}`,
      });
    }
    const started = policies.some((p) => p.status !== 'draft' || countPrompts(p.content) < 8);
    return {
      key: 'plans',
      title: 'Write the two plans',
      description: 'The Cybersecurity Risk Management Plan and the Cyber Incident Response Plan follow the AWWA section order with guidance under each heading. Replace the "What to record here" prompts with the utility\'s own facts, then publish.',
      status: statusOf(done, WATER_PLAN_TEMPLATES.length, started),
      done,
      total: WATER_PLAN_TEMPLATES.length,
      summary: `${done} of ${WATER_PLAN_TEMPLATES.length} plans published without open prompts`,
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

  private async tabletopStep(instanceId: string, organizationId: string): Promise<WaterProgramStep> {
    const links = await db.frameworkEditorControlTaskTemplateLink.findMany({
      where: { frameworkId: WATER_FRAMEWORK_ID, taskTemplate: { name: { startsWith: INTERVIEW_TASK_PREFIX } } },
      select: { taskTemplateId: true },
    });
    const tasks = await db.task.findMany({
      where: { organizationId, taskTemplateId: { in: links.map((l) => l.taskTemplateId) } },
      select: { id: true, title: true, status: true },
      orderBy: { title: 'asc' },
    });
    const done = tasks.filter((t) => t.status === 'done').length;
    return {
      key: 'tabletop',
      title: 'Run the tabletop and record the interviews',
      description: "Each interview task carries the CISA water-sector tabletop questions for one CPG goal. Walk them with the people who own the practice, or cover them in an annual exercise, and attach the notes or after-action report.",
      status: statusOf(done, tasks.length, tasks.some((t) => t.status !== 'todo')),
      done,
      total: tasks.length,
      summary: `${done} of ${tasks.length} interview tasks done`,
      href: `tasks?framework=${instanceId}`,
      details: tasks.map((t) => ({ label: t.title.replace(/^Evidence: /, ''), status: t.status.replace('_', ' '), href: `tasks/${t.id}` })),
    };
  }
}
