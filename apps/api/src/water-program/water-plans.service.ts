import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { Prisma } from '@db';
import { PoliciesService } from '../policies/policies.service';
import type { UpdatePolicyDto } from '../policies/dto/update-policy.dto';
import { PLAN_SECTIONS, type WaterPlanKey } from './plan-sections.generated';
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
  /** Fill-in boxes with a value, and how many the plan asks for. */
  filledFields: number;
  totalFields: number;
}

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

  private toView(
    policy: { id: string; name: string; status: string; content: Prisma.JsonValue[] },
    key: WaterPlanKey,
    company: string,
  ): WaterPlanView {
    const sections = readPlanSections(this.substitute(policy.content as unknown as TipTapNode[], company), PLAN_SECTIONS[key].sections);
    return {
      key,
      policyId: policy.id,
      name: policy.name,
      status: policy.status,
      sections,
      written: sections.filter((s) => s.done).length,
      total: sections.length,
      filledFields: sections.reduce((n, s) => n + s.filled, 0),
      totalFields: sections.reduce((n, s) => n + s.fields.length, 0),
    };
  }

  /** The two plan policies of the organization, split into sections with guidance, prompts and the utility's record. */
  async getPlans(frameworkInstanceId: string, organizationId: string): Promise<WaterPlanView[]> {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const policies = await db.policy.findMany({
      where: { organizationId, isArchived: false, policyTemplateId: { in: WATER_PLAN_TEMPLATES.map((p) => p.id) } },
      select: { id: true, name: true, status: true, content: true, policyTemplateId: true },
    });
    const company = await this.companyName(organizationId);
    const views: WaterPlanView[] = [];
    for (const plan of WATER_PLAN_TEMPLATES) {
      const policy = policies.find((p) => p.policyTemplateId === plan.id);
      if (policy) views.push(this.toView(policy, plan.key, company));
    }
    return views;
  }

  /** Save the utility's facts for one section: a value per fill-in field plus optional notes; all empty clears it. */
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
    const policy = await db.policy.findFirst({
      where: { id: policyId, organizationId, isArchived: false, policyTemplateId: { in: WATER_PLAN_TEMPLATES.map((p) => p.id) } },
      select: { id: true, name: true, status: true, content: true, policyTemplateId: true },
    });
    if (!policy) throw new NotFoundException('Plan policy not found');
    const plan = WATER_PLAN_TEMPLATES.find((p) => p.id === policy.policyTemplateId);
    if (!plan) throw new NotFoundException('Plan policy not found');
    const def = PLAN_SECTIONS[plan.key];
    const section = def.sections[index];
    if (!section) throw new BadRequestException(`Section ${index} does not exist; the plan has ${def.sections.length} sections`);
    const known = new Set(section.fields.map((f) => f.label));
    const stray = fields.find((f) => !known.has(f.label));
    if (stray) throw new BadRequestException(`"${stray.label}" is not a field of section ${index}`);
    const values = Object.fromEntries(fields.map((f) => [f.label, f.value]));
    const company = await this.companyName(organizationId);
    let content: TipTapNode[];
    try {
      // Writing a section also settles the {{COMPANY}} placeholder in the stored document.
      content = writePlanSection(this.substitute(policy.content as unknown as TipTapNode[], company), index, { values, notes }, section);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not update the section');
    }
    // Through the policies service so the working draft and version history stay consistent.
    await this.policies.updateById(policyId, organizationId, { content } as unknown as UpdatePolicyDto);
    const updated = await db.policy.findFirstOrThrow({
      where: { id: policyId, organizationId },
      select: { id: true, name: true, status: true, content: true },
    });
    return this.toView(updated, plan.key, company);
  }
}
