import { dispositionLine, type Rev2Build } from './build-rev2';
import { flattenRequirement, type Rev3Build } from './build-rev3';
import { ids } from './ids';
import { projected, textOf } from './read-cprt';
import { familyByR2, familyByR3, familyLabel, joinSections, padR2 } from './text';
import type { ControlRow, CprtDoc, Disposition, Pair, Rev2Requirement, Revision } from './types';

/** Titles for the 11 Rev 2 requirements that have no Rev 3 home. */
const R2_ONLY_TITLES: Record<string, string> = {
  '3.1.13': 'Remote Access Confidentiality',
  '3.4.9': 'User-Installed Software',
  '3.5.6': 'Identifier Disabling After Inactivity',
  '3.5.8': 'Password Reuse Restriction',
  '3.5.9': 'Temporary Passwords',
  '3.7.1': 'System Maintenance',
  '3.13.2': 'Security Engineering Principles',
  '3.13.3': 'Separation of User and System Management Functionality',
  '3.13.7': 'Split Tunneling',
  '3.13.14': 'Voice over Internet Protocol Controls',
  '3.14.5': 'Periodic and Real-Time Scans',
};

/** Derive each Rev 2 requirement's Rev 3 disposition from the CPRT Rev 3 export. */
export function buildDispositions(cprt3: CprtDoc, r2Ids: string[]): Map<string, Disposition> {
  const incorporated = cprt3.relsByType.get('incorporated_into') ?? new Map<string, string[]>();
  const addressed = cprt3.relsByType.get('addressed_by') ?? new Map<string, string[]>();
  const out = new Map<string, Disposition>();
  for (const r2Id of r2Ids) {
    const slot = padR2(r2Id);
    const wr = `WR-${slot}`;
    if (cprt3.byId.has(wr)) {
      const reason = textOf(cprt3, wr);
      const inc = incorporated.get(wr) ?? [];
      const addr = addressed.get(wr) ?? [];
      const kind = inc.length ? 'incorporated' : addr.length ? 'addressed_by' : 'withdrawn';
      out.set(r2Id, { r2Id, slot, kind, targets: [...(inc.length ? inc : addr)].sort(), reason });
    } else if (cprt3.byId.get(slot)?.element_type === 'requirement') {
      out.set(r2Id, { r2Id, slot, kind: 'carried', targets: [slot], reason: '' });
    } else {
      throw new Error(`Rev 2 requirement ${r2Id} has no Rev 3 slot ${slot}`);
    }
  }
  return out;
}

/** Rev 2 requirement title: supplied override, else the Rev 3 title it maps to, else ours. */
export function rev2Title(
  r2Id: string,
  d: Disposition,
  r3Titles: Map<string, string>,
  overrides: Map<string, string>,
): string {
  const override = overrides.get(r2Id);
  if (override) return override;
  const target = d.targets[0];
  const fromR3 = target ? r3Titles.get(target) : undefined;
  if (d.kind !== 'withdrawn' && fromR3) return fromR3;
  const own = R2_ONLY_TITLES[r2Id];
  if (!own) throw new Error(`No title for Rev 2 requirement ${r2Id}`);
  return own;
}

function requirementType(cprt: CprtDoc, r2Id: string): string {
  const types = projected(cprt, r2Id, 'RT_');
  if (types.includes('RT_basic')) return 'basic';
  if (types.includes('RT_derived')) return 'derived';
  return 'unspecified';
}

export interface ControlsBuild {
  controls: ControlRow[];
  /** `${rev}:${requirementId}` -> control id */
  idOfKey: Map<string, string>;
  /** requirement row id -> control key */
  controlKeyOfRow: Map<string, string>;
  /** control keys per framework */
  keysByRevision: Record<Revision, string[]>;
  controlRequirementPairs: Pair[];
}

export const controlKey = (rev: Revision, requirementId: string): string =>
  `${rev}:${requirementId}`;

/** `r2:3.1.13` -> ['r2', '3.1.13'] */
export function splitKey(key: string): [Revision, string] {
  const rev = key.slice(0, 2) as Revision;
  return [rev, key.slice(3)];
}

/**
 * One control per security requirement and revision: 110 for Rev 2, 97 for Rev 3.
 * The two revisions are independent; the Rev 2 -> Rev 3 disposition is recorded in
 * the description only.
 */
export function buildControls(args: {
  rev2: Rev2Build;
  rev3: Rev3Build;
  cprt2: CprtDoc;
  requirementsR2: Rev2Requirement[];
  dispositions: Map<string, Disposition>;
  r2Titles: Map<string, string>;
}): ControlsBuild {
  const { rev2, rev3, cprt2, requirementsR2, dispositions, r2Titles } = args;
  const r3Titles = new Map([...rev3.slots.values()].map((s) => [s.slot, s.title]));
  const r2OnSlot = new Map<string, string[]>();
  for (const d of dispositions.values()) {
    if (d.kind !== 'carried' && d.kind !== 'incorporated') continue;
    for (const t of d.targets) r2OnSlot.set(t, [...(r2OnSlot.get(t) ?? []), d.r2Id]);
  }

  const controls: ControlRow[] = [];
  const idOfKey = new Map<string, string>();
  const keysByRevision: Record<Revision, string[]> = { r2: [], r3: [] };

  for (const req of requirementsR2) {
    const d = dispositions.get(req.id);
    if (!d) throw new Error(`No disposition for ${req.id}`);
    const fam = familyByR2(req.id);
    const key = controlKey('r2', req.id);
    const id = ids.control('r2', req.id);
    idOfKey.set(key, id);
    keysByRevision.r2.push(key);
    const discussion = textOf(cprt2, `D_${req.id}`);
    controls.push({
      id,
      name: `${req.id} ${rev2Title(req.id, d, r3Titles, r2Titles)}`,
      description: joinSections([
        `${req.text} (${requirementType(cprt2, req.id)} requirement)`,
        discussion ? `Discussion: ${discussion}` : null,
        dispositionLine(d, r3Titles),
      ]),
      controlFamily: familyLabel(fam, req.familyName || fam.name),
    });
  }

  for (const req of rev3.slots.values()) {
    const fam = familyByR3(req.slot);
    const key = controlKey('r3', req.slot);
    const id = ids.control('r3', req.slot);
    idOfKey.set(key, id);
    keysByRevision.r3.push(key);
    const r2 = r2OnSlot.get(req.slot) ?? [];
    controls.push({
      id,
      name: `${req.slot} ${req.title}`,
      description: joinSections([
        flattenRequirement(req),
        req.discussion ? `Discussion: ${req.discussion}` : null,
        r2.length
          ? `Rev 2 equivalent: ${r2.sort().join(', ')}.`
          : 'New in Rev 3 (no Rev 2 equivalent).',
      ]),
      controlFamily: familyLabel(fam),
    });
  }

  const controlKeyOfRow = new Map<string, string>();
  const pairs: Pair[] = [];
  for (const row of rev2.requirements) {
    const r2Id = rev2.parentOf.get(row.id);
    const key = r2Id ? controlKey('r2', r2Id) : '';
    const ctlId = idOfKey.get(key);
    if (!r2Id || !ctlId) throw new Error(`Unmapped Rev 2 row ${row.identifier}`);
    controlKeyOfRow.set(row.id, key);
    pairs.push({ A: ctlId, B: row.id });
  }
  for (const row of rev3.requirements) {
    const slot = rev3.parentOf.get(row.id);
    const key = slot ? controlKey('r3', slot) : '';
    const ctlId = idOfKey.get(key);
    if (!slot || !ctlId) throw new Error(`Unmapped Rev 3 row ${row.identifier}`);
    controlKeyOfRow.set(row.id, key);
    pairs.push({ A: ctlId, B: row.id });
  }
  return { controls, idOfKey, controlKeyOfRow, keysByRevision, controlRequirementPairs: pairs };
}
