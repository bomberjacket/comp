/**
 * "Who's who" of a utility: the single list of people, outside contacts and shared facts
 * that both water plans read from, so nothing is asked twice. This file holds the
 * definition (which roles and contacts exist) and the pure logic; storage is in
 * water-roster.service.ts.
 */

export interface RosterRoleDef {
  key: string;
  label: string;
  hint: string;
  /** Role that normally is the same person; offered as the starting choice. */
  defaultSameAs?: string;
}

export interface RosterContactDef {
  key: string;
  label: string;
  nameLabel: string;
  detailLabel: string;
  phoneLabel: string;
  /** The utility may state it has none (no insurer, not a WaterISAC member). */
  allowNone?: boolean;
}

export interface RosterFactDef {
  key: string;
  label: string;
  hint: string;
  long?: boolean;
  optional?: boolean;
}

export const ROSTER_ROLES: RosterRoleDef[] = [
  { key: 'cyber_lead', label: 'Cybersecurity lead (overall, IT and OT)', hint: 'Accountable for all cybersecurity at the utility; EPA checklist question 1.B' },
  { key: 'cyber_alternate', label: 'Alternate for the cybersecurity lead', hint: 'Acts when the lead is away' },
  { key: 'ot_lead', label: 'OT (control systems) security lead', hint: 'Security oversight of SCADA, PLCs and the plant network; EPA question 1.C; may be the same person at a small utility' },
  { key: 'operations_lead', label: 'Operations lead', hint: 'Runs treatment and distribution' },
  { key: 'it_lead', label: 'IT lead or provider', hint: 'Person or company that runs the business network' },
  { key: 'finance', label: 'Finance and procurement contact', hint: 'Approves purchases and keeps contracts' },
  { key: 'incident_commander', label: 'Incident commander', hint: 'Leads the response to a cyber incident', defaultSameAs: 'cyber_lead' },
  { key: 'alternate_commander', label: 'Alternate incident commander', hint: 'Leads when the commander cannot', defaultSameAs: 'cyber_alternate' },
  { key: 'communications_lead', label: 'Communications lead', hint: 'Speaks to customers, the press and staff during an incident' },
  { key: 'executive', label: 'Executive who approves spending and public statements', hint: 'General manager, board chair or similar' },
];

export const ROSTER_CONTACTS: RosterContactDef[] = [
  { key: 'primacy_agency', label: 'State primacy agency', nameLabel: 'Agency', detailLabel: 'Office or contact for reporting', phoneLabel: 'Phone' },
  { key: 'fbi', label: 'FBI field office', nameLabel: 'Field office', detailLabel: 'Contact, if known', phoneLabel: 'Phone' },
  { key: 'insurer', label: 'Cyber insurance carrier', nameLabel: 'Carrier', detailLabel: 'Policy number', phoneLabel: 'Breach line', allowNone: true },
  { key: 'waterisac', label: 'WaterISAC', nameLabel: 'Membership or contact', detailLabel: 'Notes', phoneLabel: 'Phone', allowNone: true },
];

export const ROSTER_FACTS: RosterFactDef[] = [
  { key: 'manual_procedures', label: 'Where the manual operation procedures are kept', hint: 'For example: binder in the control room and a copy at the district office' },
  { key: 'other_partners', label: 'Other outside partners and numbers', hint: 'One per line: who they are and how to reach them', long: true, optional: true },
];

export interface RosterPerson {
  name: string;
  title: string;
  phone: string;
  email: string;
  /** Key of the role whose person also holds this role; the own fields are then ignored. */
  sameAs: string;
}

export interface RosterContact {
  name: string;
  detail: string;
  phone: string;
  none: boolean;
}

export interface Roster {
  staff: Record<string, RosterPerson>;
  contacts: Record<string, RosterContact>;
  facts: Record<string, string>;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 2000) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Whatever was stored or sent, reduced to the defined roles, contacts and facts. */
export function normalizeRoster(raw: { staff?: unknown; contacts?: unknown; facts?: unknown }): Roster {
  const staffIn = obj(raw.staff);
  const contactsIn = obj(raw.contacts);
  const factsIn = obj(raw.facts);
  const roleKeys = new Set(ROSTER_ROLES.map((r) => r.key));
  return {
    staff: Object.fromEntries(
      ROSTER_ROLES.map((r) => {
        const p = obj(staffIn[r.key]);
        const sameAs = text(p.sameAs);
        return [r.key, { name: text(p.name), title: text(p.title), phone: text(p.phone), email: text(p.email), sameAs: roleKeys.has(sameAs) && sameAs !== r.key ? sameAs : '' }];
      }),
    ),
    contacts: Object.fromEntries(
      ROSTER_CONTACTS.map((c) => {
        const v = obj(contactsIn[c.key]);
        return [c.key, { name: text(v.name), detail: text(v.detail), phone: text(v.phone), none: !!c.allowNone && v.none === true }];
      }),
    ),
    facts: Object.fromEntries(ROSTER_FACTS.map((f) => [f.key, text(factsIn[f.key])])),
  };
}

/**
 * The person who holds a role, following "same person as". Two roles that point at each
 * other form a circle with nobody at the end; the role then falls back to the name typed
 * for it, or failing that to the first name typed anywhere in the circle, so a slip in
 * the choices never blanks a box.
 */
export function personOf(roster: Roster, key: string): RosterPerson | undefined {
  const chain: RosterPerson[] = [];
  const seen = new Set<string>();
  let current = key;
  while (!seen.has(current)) {
    seen.add(current);
    const p = roster.staff[current];
    if (!p) return undefined;
    if (!p.sameAs) return p;
    chain.push(p);
    current = p.sameAs;
  }
  return chain.find((p) => p.name);
}

const join = (...parts: string[]): string => parts.map((p) => p.trim()).filter(Boolean).join(', ');

function contactLine(roster: Roster, key: string): string {
  const c = roster.contacts[key];
  if (!c) return '';
  if (c.none) return 'None';
  return join(c.name, c.detail, c.phone);
}

/**
 * Values of the plan boxes that read from the roster. `roster_<role>` is name, title,
 * phone (risk plan); `roster_<role>_ir` is name, phone, email (incident plan, where the
 * mobile and a personal email matter). An unfilled entry gives an empty value, which
 * the plan counts as not filled in.
 */
export function rosterAutoValues(roster: Roster): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of ROSTER_ROLES) {
    const p = personOf(roster, r.key);
    out[`roster_${r.key}`] = p?.name ? join(p.name, p.title, p.phone) : '';
    out[`roster_${r.key}_ir`] = p?.name ? join(p.name, p.phone, p.email) : '';
  }
  const insurer = roster.contacts.insurer;
  const partners = ROSTER_CONTACTS.map((c) => {
    const line = contactLine(roster, c.key);
    return line && line !== 'None' ? `${c.label}: ${line}` : '';
  }).filter(Boolean);
  if (roster.facts.other_partners) partners.push(...roster.facts.other_partners.split(/\n+/).map((l) => l.trim()).filter(Boolean));
  out.roster_primacy_name = roster.contacts.primacy_agency?.name ?? '';
  out.roster_primacy_contact = contactLine(roster, 'primacy_agency');
  out.roster_insurer = insurer?.none ? 'None' : insurer?.name ? join(insurer.name, insurer.detail ? `policy ${insurer.detail}` : '', insurer.phone ? `breach line ${insurer.phone}` : '') : '';
  out.roster_partners = partners.join('\n');
  out.roster_manual_procedures = roster.facts.manual_procedures ?? '';
  return out;
}

/** How much of the roster is filled in: every role, every contact (or "none"), every required fact. */
export function rosterProgress(roster: Roster): { filled: number; total: number } {
  const roles = ROSTER_ROLES.filter((r) => !!personOf(roster, r.key)?.name).length;
  const contacts = ROSTER_CONTACTS.filter((c) => {
    const v = roster.contacts[c.key];
    return !!v && (v.none || !!v.name || !!v.phone);
  }).length;
  const required = ROSTER_FACTS.filter((f) => !f.optional);
  const facts = required.filter((f) => !!roster.facts[f.key]).length;
  return { filled: roles + contacts + facts, total: ROSTER_ROLES.length + ROSTER_CONTACTS.length + required.length };
}

/** Distinct people on the roster, in role order, each with the roles they hold. */
export function rosterPeople(roster: Roster): Array<{ name: string; roles: string[] }> {
  const people = new Map<string, string[]>();
  for (const r of ROSTER_ROLES) {
    const name = personOf(roster, r.key)?.name;
    if (!name) continue;
    people.set(name, [...(people.get(name) ?? []), r.label]);
  }
  return [...people.entries()].map(([name, roles]) => ({ name, roles }));
}

/** Plan box labels whose typed value seeds the roster the first time it is opened. */
export const ROSTER_SEED_LABELS: { staff: Record<string, string[]>; contactName: Record<string, string[]>; contactDetail: Record<string, string[]>; facts: Record<string, string[]> } = {
  staff: {
    cyber_lead: ['Cybersecurity lead'],
    cyber_alternate: ['Alternate for the cybersecurity lead'],
    ot_lead: ['OT cybersecurity lead', 'OT lead'],
    operations_lead: ['Operations lead'],
    it_lead: ['IT lead or provider'],
    finance: ['Finance and procurement contact'],
    incident_commander: ['Incident commander'],
    alternate_commander: ['Alternate commander'],
    communications_lead: ['Communications lead'],
    executive: ['Executive who approves spending and public statements'],
  },
  contactName: { primacy_agency: ['Regulatory primacy agency'], insurer: ['Cyber insurance carrier'] },
  contactDetail: { primacy_agency: ['State primacy agency reporting contact'] },
  facts: { manual_procedures: ['Where the manual operation procedures are kept'], other_partners: ['External partners and numbers'] },
};
