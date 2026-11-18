import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { Prisma } from '@db';
import { PLAN_SECTIONS } from './plan-sections.generated';
import { readPlanSections, type TipTapNode } from './plan-writer';
import {
  normalizeRoster,
  ROSTER_CONTACTS,
  ROSTER_FACTS,
  ROSTER_ROLES,
  ROSTER_SEED_LABELS,
  rosterPeople,
  rosterProgress,
  type Roster,
} from './roster';
import { WATER_FRAMEWORK_ID, WATER_PLAN_TEMPLATES } from './water-program.constants';

/**
 * What the utility already typed into the plan boxes that now read from the roster, so
 * the first visit to Who's who starts from those answers instead of from nothing. A
 * typed line such as "Jane Doe, operator, 555 0100" goes into the name as it stands.
 */
async function seedFromPlans(organizationId: string): Promise<Roster> {
  const policies = await db.policy.findMany({
    where: { organizationId, isArchived: false, policyTemplateId: { in: WATER_PLAN_TEMPLATES.map((p) => p.id) } },
    select: { content: true, policyTemplateId: true },
  });
  const typed = new Map<string, string>();
  for (const plan of WATER_PLAN_TEMPLATES) {
    const policy = policies.find((p) => p.policyTemplateId === plan.id);
    if (!policy) continue;
    for (const section of readPlanSections(policy.content as unknown as TipTapNode[], PLAN_SECTIONS[plan.key].sections)) {
      for (const f of section.fields) {
        if (f.value.trim() && !typed.has(f.label)) typed.set(f.label, f.value.trim());
      }
    }
  }
  const first = (labels: string[] | undefined): string => (labels ?? []).map((l) => typed.get(l) ?? '').find(Boolean) ?? '';
  const staff = Object.fromEntries(
    ROSTER_ROLES.map((r) => {
      const name = first(ROSTER_SEED_LABELS.staff[r.key]);
      return [r.key, { name, sameAs: name ? '' : (r.defaultSameAs ?? '') }];
    }),
  );
  const contacts = Object.fromEntries(
    ROSTER_CONTACTS.map((c) => {
      const name = first(ROSTER_SEED_LABELS.contactName[c.key]);
      const none = !!c.allowNone && /^none\.?$/i.test(name);
      return [c.key, { name: none ? '' : name, detail: first(ROSTER_SEED_LABELS.contactDetail[c.key]), none }];
    }),
  );
  const facts = Object.fromEntries(ROSTER_FACTS.map((f) => [f.key, first(ROSTER_SEED_LABELS.facts[f.key])]));
  return normalizeRoster({ staff, contacts, facts });
}

const idList = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null);

/**
 * The stored roster, or before the first save the starting point taken from the plans.
 * `accessVendors` is the ids of the vendors marked as having network or remote access;
 * null until the utility has marked any, and then every vendor counts.
 */
export async function loadRoster(
  frameworkInstanceId: string,
  organizationId: string,
): Promise<{ roster: Roster; saved: boolean; accessVendors: string[] | null }> {
  const row = await db.utilityRoster.findFirst({
    where: { frameworkInstanceId, organizationId },
    select: { staff: true, contacts: true, facts: true, accessVendors: true },
  });
  if (row) return { roster: normalizeRoster(row), saved: true, accessVendors: idList(row.accessVendors) };
  return { roster: await seedFromPlans(organizationId), saved: false, accessVendors: null };
}

@Injectable()
export class WaterRosterService {
  private async assertInstance(frameworkInstanceId: string, organizationId: string): Promise<void> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
  }

  private view(roster: Roster, saved: boolean, accessVendors: string[] | null) {
    return {
      /** Vendors marked as having network or remote access; null until any is marked. */
      accessVendors,
      definition: { roles: ROSTER_ROLES, contacts: ROSTER_CONTACTS, facts: ROSTER_FACTS },
      ...roster,
      /** False until the utility has saved the list once. */
      saved,
      progress: rosterProgress(roster),
      people: rosterPeople(roster),
    };
  }

  async get(frameworkInstanceId: string, organizationId: string) {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const { roster, saved, accessVendors } = await loadRoster(frameworkInstanceId, organizationId);
    return this.view(roster, saved, accessVendors);
  }

  async save(frameworkInstanceId: string, organizationId: string, input: { staff?: unknown; contacts?: unknown; facts?: unknown }) {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const roster = normalizeRoster(input);
    const data = {
      staff: roster.staff as unknown as Prisma.InputJsonValue,
      contacts: roster.contacts as unknown as Prisma.InputJsonValue,
      facts: roster.facts as unknown as Prisma.InputJsonValue,
    };
    const row = await db.utilityRoster.upsert({
      where: { frameworkInstanceId },
      create: { organizationId, frameworkInstanceId, ...data },
      update: data,
      select: { accessVendors: true },
    });
    return this.view(roster, true, idList(row.accessVendors));
  }

  /**
   * Mark which vendors of the Vendors page have network or remote access. Only these feed
   * the plans. Saved on its own, so ticking a vendor does not wait for the rest of the list;
   * when nothing was saved yet, the people carried over from the plans are stored with it.
   */
  async saveAccessVendors(frameworkInstanceId: string, organizationId: string, vendorIds: string[]) {
    await this.assertInstance(frameworkInstanceId, organizationId);
    const known = await db.vendor.findMany({ where: { organizationId, id: { in: vendorIds } }, select: { id: true } });
    const ids = known.map((v) => v.id);
    const current = await loadRoster(frameworkInstanceId, organizationId);
    await db.utilityRoster.upsert({
      where: { frameworkInstanceId },
      create: {
        organizationId,
        frameworkInstanceId,
        staff: current.roster.staff as unknown as Prisma.InputJsonValue,
        contacts: current.roster.contacts as unknown as Prisma.InputJsonValue,
        facts: current.roster.facts as unknown as Prisma.InputJsonValue,
        accessVendors: ids,
      },
      update: { accessVendors: ids },
    });
    return this.view(current.roster, true, ids);
  }
}
