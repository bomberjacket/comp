import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { Prisma } from '@db';
import { SCORE_SCALE, VENDOR_CHECKLISTS, WEIGHT_SCALE, type VendorChecklistDef, type VendorChecklistKind } from './checklists.generated';
import type { ChecklistItemInputDto, UpsertChecklistDto } from './dto/upsert-checklist.dto';

export interface ChecklistItemAnswer {
  itemId: string;
  weight: number;
  score: number;
  supplierResponse?: string;
  inContract?: boolean | null;
  explanation?: string;
}

export interface SectionResult {
  section: string;
  items: number;
  scored: number;
  /** sum of weight × 3 over weighted items */
  target: number;
  /** sum of weight × score */
  actual: number;
  gap: number;
  percent: number | null;
}

export interface ChecklistResults {
  sections: SectionResult[];
  target: number;
  actual: number;
  gap: number;
  percent: number | null;
  inContract: number;
}

export interface ChecklistAssessmentView {
  id: string | null;
  kind: VendorChecklistKind;
  name: string;
  contractReference: string | null;
  evaluationFrequency: string | null;
  notes: string | null;
  assessedAt: Date | null;
  assessedById: string | null;
  updatedAt: Date | null;
  items: ChecklistItemAnswer[];
  results: ChecklistResults;
}

export const CHECKLIST_KINDS = Object.keys(VENDOR_CHECKLISTS) as VendorChecklistKind[];

/** EPA's arithmetic: total value = weight × score; the perfect score is weight × 3. */
export function scoreChecklist(def: VendorChecklistDef, items: ChecklistItemAnswer[]): ChecklistResults {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const sections: SectionResult[] = def.sections.map((section) => {
    const defs = def.items.filter((i) => i.section === section);
    let target = 0;
    let actual = 0;
    let scored = 0;
    for (const d of defs) {
      const a = byId.get(d.id);
      if (!a || a.weight === 0) continue;
      scored += 1;
      target += a.weight * 3;
      actual += a.weight * a.score;
    }
    return {
      section,
      items: defs.length,
      scored,
      target,
      actual,
      gap: target - actual,
      percent: target > 0 ? Math.round((actual / target) * 100) : null,
    };
  });
  const target = sections.reduce((s, x) => s + x.target, 0);
  const actual = sections.reduce((s, x) => s + x.actual, 0);
  return {
    sections,
    target,
    actual,
    gap: target - actual,
    percent: target > 0 ? Math.round((actual / target) * 100) : null,
    inContract: items.filter((i) => i.inContract === true).length,
  };
}

@Injectable()
export class VendorChecklistsService {
  getDefinitions() {
    return { checklists: Object.values(VENDOR_CHECKLISTS), weightScale: WEIGHT_SCALE, scoreScale: SCORE_SCALE };
  }

  private async assertVendor(vendorId: string, organizationId: string): Promise<void> {
    const vendor = await db.vendor.findFirst({ where: { id: vendorId, organizationId }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  private toView(kind: VendorChecklistKind, row: {
    id: string;
    contractReference: string | null;
    evaluationFrequency: string | null;
    notes: string | null;
    assessedAt: Date | null;
    assessedById: string | null;
    updatedAt: Date;
    items: Prisma.JsonValue;
  } | null): ChecklistAssessmentView {
    const def = VENDOR_CHECKLISTS[kind];
    const items = Array.isArray(row?.items) ? (row?.items as unknown as ChecklistItemAnswer[]) : [];
    return {
      id: row?.id ?? null,
      kind,
      name: def.name,
      contractReference: row?.contractReference ?? null,
      evaluationFrequency: row?.evaluationFrequency ?? null,
      notes: row?.notes ?? null,
      assessedAt: row?.assessedAt ?? null,
      assessedById: row?.assessedById ?? null,
      updatedAt: row?.updatedAt ?? null,
      items,
      results: scoreChecklist(def, items),
    };
  }

  /** Both checklists for a vendor, scored; an unfilled one comes back empty with null id. */
  async list(vendorId: string, organizationId: string): Promise<ChecklistAssessmentView[]> {
    await this.assertVendor(vendorId, organizationId);
    const rows = await db.vendorChecklistAssessment.findMany({ where: { vendorId, organizationId } });
    return CHECKLIST_KINDS.map((kind) => this.toView(kind, rows.find((r) => r.kind === kind) ?? null));
  }

  async upsert(args: {
    vendorId: string;
    organizationId: string;
    kind: string;
    dto: UpsertChecklistDto;
    userId?: string;
  }): Promise<ChecklistAssessmentView> {
    const { vendorId, organizationId, dto, userId } = args;
    if (!CHECKLIST_KINDS.includes(args.kind as VendorChecklistKind)) {
      throw new BadRequestException(`Unknown checklist kind ${args.kind}; expected ${CHECKLIST_KINDS.join(' or ')}`);
    }
    const kind = args.kind as VendorChecklistKind;
    await this.assertVendor(vendorId, organizationId);
    const def = VENDOR_CHECKLISTS[kind];
    const known = new Set(def.items.map((i) => i.id));
    const seen = new Set<string>();
    const items: ChecklistItemAnswer[] = dto.items.map((i: ChecklistItemInputDto) => {
      if (!known.has(i.itemId)) throw new BadRequestException(`Item ${i.itemId} is not in the ${kind} checklist`);
      if (seen.has(i.itemId)) throw new BadRequestException(`Item ${i.itemId} given twice`);
      seen.add(i.itemId);
      return {
        itemId: i.itemId,
        weight: i.weight,
        score: i.score,
        supplierResponse: i.supplierResponse?.trim() || undefined,
        inContract: i.inContract ?? null,
        explanation: i.explanation?.trim() || undefined,
      };
    });
    const member = userId
      ? await db.member.findFirst({ where: { userId, organizationId, isActive: true }, select: { id: true } })
      : null;
    const data = {
      items: items as unknown as Prisma.InputJsonValue,
      contractReference: dto.contractReference?.trim() || null,
      evaluationFrequency: dto.evaluationFrequency?.trim() || null,
      notes: dto.notes?.trim() || null,
      assessedAt: new Date(),
      assessedById: member?.id ?? null,
    };
    const row = await db.vendorChecklistAssessment.upsert({
      where: { vendorId_kind: { vendorId, kind } },
      create: { organizationId, vendorId, kind, ...data },
      update: data,
    });
    return this.toView(kind, row);
  }
}
