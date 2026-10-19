import type { Rev2Build } from './build-rev2';
import { flattenRequirement, type Rev3Build } from './build-rev3';
import { ids } from './ids';
import { textOf } from './read-cprt';
import { familyByR2, familyByR3, familyLabel, joinSections, padR2 } from './text';
import type {
  ControlRow,
  CprtDoc,
  Disposition,
  Pair,
  Rev2Objective,
  Rev2Requirement,
} from './types';

/** Short titles for the 11 Rev 2 requirements that have no Rev 3 home. */
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

/** Choose a target for the two requirements NIST split across two Rev 3 requirements. */
function pickTarget(r2Id: string, objectiveText: string, targets: string[]): string {
  const fallback = targets[0] ?? '';
  if (targets.length < 2) return fallback;
  if (r2Id === '3.4.7' && targets.includes('03.04.08') && targets.includes('03.04.06')) {
    return /program|software|application/i.test(objectiveText) ? '03.04.08' : '03.04.06';
  }
  if (r2Id === '3.7.2' && targets.includes('03.07.06') && targets.includes('03.07.04')) {
    return /personnel/i.test(objectiveText) ? '03.07.06' : '03.07.04';
  }
  return fallback;
}

export interface ControlsBuild {
  controls: ControlRow[];
  /** control key -> control id */
  idOfKey: Map<string, string>;
  /** requirement row id -> control key */
  controlKeyOfRow: Map<string, string>;
  /** control keys referenced by each framework */
  keysByRevision: { r2: Set<string>; r3: Set<string> };
  controlRequirementPairs: Pair[];
}

export function buildControls(args: {
  rev2: Rev2Build;
  rev3: Rev3Build;
  requirementsR2: Rev2Requirement[];
  objectives: Rev2Objective[];
  dispositions: Map<string, Disposition>;
  overrides: Map<string, string>;
}): ControlsBuild {
  const { rev2, rev3, requirementsR2, objectives, dispositions, overrides } = args;
  const reqR2 = new Map(requirementsR2.map((r) => [r.id, r]));
  const objByIdent = new Map(objectives.map((o) => [o.identifier, o]));

  // Rev 2 requirements that land on each Rev 3 slot (carried + incorporated).
  const r2OnSlot = new Map<string, { carried: string[]; incorporated: string[] }>();
  for (const d of dispositions.values()) {
    for (const t of d.targets) {
      const entry = r2OnSlot.get(t) ?? { carried: [], incorporated: [] };
      if (d.kind === 'carried') entry.carried.push(d.r2Id);
      if (d.kind === 'incorporated') entry.incorporated.push(d.r2Id);
      r2OnSlot.set(t, entry);
    }
  }

  const controls: ControlRow[] = [];
  const idOfKey = new Map<string, string>();
  for (const req of rev3.slots.values()) {
    const fam = familyByR3(req.slot);
    const on = r2OnSlot.get(req.slot) ?? { carried: [], incorporated: [] };
    const key = req.slot;
    const id = ids.control(key);
    idOfKey.set(key, id);
    controls.push({
      id,
      name: `${req.slot} ${req.title}`,
      description: joinSections([
        flattenRequirement(req),
        on.carried.length
          ? `Rev 2 equivalent: ${on.carried.join(', ')}.`
          : 'New in Rev 3 (no Rev 2 equivalent).',
        on.incorporated.length
          ? `Also satisfies Rev 2 requirements withdrawn into this one: ${on.incorporated.join(', ')}.`
          : null,
      ]),
      controlFamily: familyLabel(fam),
    });
  }
  for (const d of [...dispositions.values()].sort((a, b) => a.slot.localeCompare(b.slot))) {
    if (d.kind !== 'addressed_by' && d.kind !== 'withdrawn') continue;
    const req = reqR2.get(d.r2Id);
    if (!req) throw new Error(`Missing Rev 2 requirement ${d.r2Id}`);
    const fam = familyByR2(d.r2Id);
    const title = R2_ONLY_TITLES[d.r2Id];
    if (!title) throw new Error(`No Rev 2-only title for ${d.r2Id}`);
    const key = `r2:${d.r2Id}`;
    const id = ids.control(key);
    idOfKey.set(key, id);
    controls.push({
      id,
      name: `${d.r2Id} ${title} (Rev 2 only)`,
      description: joinSections([
        req.text,
        `Withdrawn in NIST SP 800-171 Rev 3: ${d.reason}`,
        d.kind === 'addressed_by'
          ? `Related Rev 3 requirements: ${d.targets.map((t) => `${t} ${rev3.slots.get(t)?.title ?? ''}`.trim()).join(', ')}.`
          : null,
      ]),
      controlFamily: familyLabel(fam),
    });
  }

  const controlKeyOfRow = new Map<string, string>();
  const keysByRevision = { r2: new Set<string>(), r3: new Set<string>() };
  const pairs: Pair[] = [];
  for (const row of rev2.requirements) {
    const r2Id = rev2.parentOf.get(row.id);
    const objective = rev2.objectiveOf.get(row.id);
    const d = r2Id ? dispositions.get(r2Id) : undefined;
    if (!r2Id || !objective || !d) throw new Error(`Unmapped Rev 2 row ${row.identifier}`);
    let key: string;
    if (d.kind === 'carried') key = d.slot;
    else if (d.kind === 'incorporated') {
      key =
        overrides.get(objective) ??
        pickTarget(r2Id, objByIdent.get(objective)?.text ?? '', d.targets);
    } else key = `r2:${r2Id}`;
    const ctlId = idOfKey.get(key);
    if (!ctlId) throw new Error(`No control for key ${key} (objective ${objective})`);
    controlKeyOfRow.set(row.id, key);
    keysByRevision.r2.add(key);
    pairs.push({ A: ctlId, B: row.id });
  }
  for (const row of rev3.requirements) {
    const slot = rev3.parentOf.get(row.id);
    const ctlId = slot ? idOfKey.get(slot) : undefined;
    if (!slot || !ctlId) throw new Error(`Unmapped Rev 3 row ${row.identifier}`);
    controlKeyOfRow.set(row.id, slot);
    keysByRevision.r3.add(slot);
    pairs.push({ A: ctlId, B: row.id });
  }
  return { controls, idOfKey, controlKeyOfRow, keysByRevision, controlRequirementPairs: pairs };
}

/** `r2:3.1.13` -> `3.1.13`; Rev 3 slot keys return null. */
export function r2IdOfKey(key: string): string | null {
  return key.startsWith('r2:') ? key.slice(3) : null;
}
