import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { Prisma } from '@db';
import { PoliciesService } from '../policies/policies.service';
import type { UpdatePolicyDto } from '../policies/dto/update-policy.dto';
import { planAutoValues } from './plan-auto';
import { PLAN_SECTIONS, type PlanAutoKey, type PlanSectionDef, type WaterPlanKey } from './plan-sections.generated';
import { readPlanSections, writePlanSection, type PlanSectionView, type TipTapNode } from './plan-writer';
import { WATER_FRAMEWORK_ID, WATER_PLAN_TEMPLATES } from './water-program.constants';

export interface WaterPlanView {
  key: WaterPlanKey;
  policyId: string;
  name: string;
  status: string;
  sections: PlanSectionView[];
  written: number;
  total: number;
  /** Required fill-in boxes with a value, and how many the plan asks for. */
  filledFields: number;
  totalFields: number;
}

type Auto = Record<PlanAutoKey, string>;
type PlanPolicy = { id: string; name: string; status: string; content: Prisma.JsonValue[]; policyTemplateId?: string | null };

@Injectable()
export class WaterPlansService {
  constructor(private readonly policies: PoliciesService) {}

  private async assertInstance(frameworkInstanceId: string, organizationId: string): Promise<void> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
  }

  /** The seed templates say {{COMPANY}}; upstream's onboarding job substitutes it only when AI processing runs. */
  private async companyName(organizationId: string): Promise<string> {
    const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    return org?.name?.trim() || 'the utility';
  }

  private substitute(nodes: TipTapNode[], company: string): TipTapNode[] {
    const walk = (n: TipTapNode): TipTapNode => ({
      ...n,
      ...(typeof n.text === 'string' ? { text: n.text.replace(/\{\{COMPANY\}\}/g, company) } : {}),
      ...(n.content ? { content: n.content.map(walk) } : {}),
    });
    return nodes.map(walk);
  }

  private toView(policy: PlanPolicy, key: WaterPlanKey, company: string, auto: Auto): WaterPlanView {
    const sections = readPlanSections(this.substitute(policy.content as unknown as TipTapNode[], company), PLAN_SECTIONS[key].sections, auto);
    return {
      key,
      policyId: policy.id,
      name: policy.name,
      status: policy.status,
      sections,
      written: sections.filter((s) => s.done).length,
      total: sections.length,
      filledFields: sections.reduce((n, s) => n + s.filled, 0),
      totalFields: sections.reduce((n, s) => n + s.total, 0),
    };
  }

  private async planPolicy(policyId: string, organizationId: string) {
    const policy = await db.policy.findFirst({
      where: { id: policyId, organizationId, isArchived: false, policyTemplateId: { in: WATER_PLAN_TEMPLATES.map((p) => p.id) } },
      select: { id: true, name: true, status: true, content: true, policyTemplateId: true },
    });
    const plan = WATER_PLAN_TEMPLATES.find((p) => p.id === policy?.policyTemplateId);
    if (!policy || !plan) throw new NotFoundException('Plan policy not found');
    return { policy, plan };
  }

  /** Through the policies service so the working draft and version history stay consistent. */
  private async store(policyId: string, organizationId: string, content: TipTapNode[]): Promise<PlanPolicy> {
    await this.policies.updateById(policyId, organizationId, { content } as unknown as UpdatePolicyDto);
    return db.policy.findFirstOrThrow({
      where: { id: policyId, organizationId },
      select: { id: true, name: true, status: true, content: true },
    });
  }

  /** The platform's own values for a section's auto-filled boxes, by label. */
  private autoByLabel(section: PlanSectionDef, auto: Auto): Record<string, string> {
    return Object.fromEntries(section.fields.filter((f) => f.auto).map((f) => [f.label, auto[f.auto as PlanAutoKey]]));
  }

  /** The two plan policies of the organization, split into sections with standard wording, fields and notes. */
  async getPlans(frameworkInstanceId: string, organizationId: string): Promise<WaterPlanView[]> {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const policies = await db.policy.findMany({
      where: { organizationId, isArchived: false, policyTemplateId: { in: WATER_PLAN_TEMPLATES.map((p) => p.id) } },
      select: { id: true, name: true, status: true, content: true, policyTemplateId: true },
    });
    const [company, auto] = await Promise.all([this.companyName(organizationId), planAutoValues(frameworkInstanceId, organizationId)]);
    const views: WaterPlanView[] = [];
    for (const plan of WATER_PLAN_TEMPLATES) {
      const policy = policies.find((p) => p.policyTemplateId === plan.id);
      if (policy) views.push(this.toView(policy, plan.key, company, auto));
    }
    return views;
  }

  /**
   * Save the utility's facts for one section: a value per fill-in box plus optional
   * notes. Boxes the platform fills in are written with its own values; a save with
   * nothing from the utility clears the section back to its prompts.
   */
  async writeSection(args: {
    frameworkInstanceId: string;
    organizationId: string;
    policyId: string;
    index: number;
    fields: Array<{ label: string; value: string }>;
    notes: string;
  }): Promise<WaterPlanView> {
    const { frameworkInstanceId, organizationId, policyId, index, fields, notes } = args;
    await this.assertInstance(frameworkInstanceId, organizationId);
    const { policy, plan } = await this.planPolicy(policyId, organizationId);
    const def = PLAN_SECTIONS[plan.key];
    const section = def.sections[index];
    if (!section) throw new BadRequestException(`Section ${index} does not exist; the plan has ${def.sections.length} sections`);
    const manual = new Set(section.fields.filter((f) => !f.auto).map((f) => f.label));
    const known = new Set(section.fields.map((f) => f.label));
    const stray = fields.find((f) => !known.has(f.label));
    if (stray) throw new BadRequestException(`"${stray.label}" is not a field of section ${index}`);
    const [company, auto] = await Promise.all([this.companyName(organizationId), planAutoValues(frameworkInstanceId, organizationId)]);
    const typed = Object.fromEntries(fields.filter((f) => manual.has(f.label)).map((f) => [f.label, f.value]));
    const hasOwn = notes.trim().length > 0 || Object.values(typed).some((v) => v.trim());
    const values = hasOwn ? { ...typed, ...this.autoByLabel(section, auto) } : {};
    let content: TipTapNode[];
    try {
      // Writing a section also settles the {{COMPANY}} placeholder in the stored document.
      content = writePlanSection(this.substitute(policy.content as unknown as TipTapNode[], company), index, { values, notes }, section);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not update the section');
    }
    return this.toView(await this.store(policyId, organizationId, content), plan.key, company, auto);
  }

  /**
   * Write the platform's current values into every auto-filled box of the plan, keeping
   * what the utility typed. Called before publishing so the published document carries them.
   */
  async syncAuto(frameworkInstanceId: string, organizationId: string, policyId: string): Promise<WaterPlanView> {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const { policy, plan } = await this.planPolicy(policyId, organizationId);
    const defs = PLAN_SECTIONS[plan.key].sections;
    const [company, auto] = await Promise.all([this.companyName(organizationId), planAutoValues(frameworkInstanceId, organizationId)]);
    let content = this.substitute(policy.content as unknown as TipTapNode[], company);
    const current = readPlanSections(content, defs, auto);
    let changed = false;
    defs.forEach((section, index) => {
      if (!section.fields.some((f) => f.auto)) return;
      const view = current[index];
      if (!view) return;
      const values = { ...Object.fromEntries(view.fields.map((f) => [f.label, f.value])), ...this.autoByLabel(section, auto) };
      content = writePlanSection(content, index, { values, notes: view.notes }, section);
      changed = true;
    });
    const stored = changed ? await this.store(policyId, organizationId, content) : policy;
    return this.toView(stored, plan.key, company, auto);
  }
}
