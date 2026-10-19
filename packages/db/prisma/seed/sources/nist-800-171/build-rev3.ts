import { ids } from './ids';
import { elementsOf, projected, textOf, titleOf } from './read-cprt';
import {
  FAMILIES,
  familyByR3,
  familyLabel,
  joinSections,
  naturalCompare,
  sentenceCase,
  stripTrailingPeriod,
  truncate,
} from './text';
import type { CprtDoc, FrameworkRow, RequirementRow, Rev3Requirement } from './types';

export interface Rev3Build {
  framework: FrameworkRow;
  requirements: RequirementRow[];
  /** active slots (97) in natural order */
  slots: Map<string, Rev3Requirement>;
  /** withdrawn slots (33) with NIST's withdrawal reason */
  withdrawn: Map<string, string>;
  /** requirement row id -> slot (03.01.01) */
  parentOf: Map<string, string>;
}

export const REV3_FRAMEWORK: Omit<FrameworkRow, 'id' | 'familyId'> = {
  name: 'NIST SP 800-171 Rev 3',
  version: '3.0',
  description:
    'Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations, ' +
    'Revision 3 (May 2024). 17 families, 97 security requirements with organization-defined ' +
    'parameters, assessed with the determination statements of NIST SP 800-171A Rev 3.',
  visible: true,
};

const SR = 'SR-';
const DS = 'DS-';

function partLabel(srId: string, slot: string): string {
  const rest = srId.slice((SR + slot).length);
  return rest.startsWith('.') ? rest.slice(1) : rest;
}

function collectSlot(cprt: CprtDoc, slot: string): Rev3Requirement {
  const parts = elementsOf(cprt, 'security_requirement')
    .filter(
      (e) => e.element_identifier === SR + slot || e.element_identifier.startsWith(`${SR}${slot}.`),
    )
    .filter((e) => e.text.trim() !== '')
    .sort((a, b) => naturalCompare(a.element_identifier, b.element_identifier))
    .map((e) => ({ label: partLabel(e.element_identifier, slot), text: e.text.trim() }));

  const odps = elementsOf(cprt, 'odp')
    .filter((e) => e.element_identifier.startsWith(`A.${slot}.ODP`))
    .sort((a, b) => naturalCompare(a.element_identifier, b.element_identifier))
    .map((e) => {
      const statementId = projected(cprt, e.element_identifier, 'OS-')[0];
      return {
        identifier: e.element_identifier,
        title: e.title.trim(),
        text: e.text.trim(),
        statement: statementId ? textOf(cprt, statementId) : '',
      };
    });

  // Determinations hang off a sub-part (DS-A.03.01.01.a[01]), a bracket on the slot
  // (DS-A.03.10.08[01]) or, for 12 single-statement requirements, the bare slot (DS-A.03.08.02).
  const determinations = elementsOf(cprt, 'determination')
    .filter(
      (e) =>
        e.element_identifier === `${DS}A.${slot}` ||
        e.element_identifier.startsWith(`${DS}A.${slot}.`) ||
        e.element_identifier.startsWith(`${DS}A.${slot}[`),
    )
    .sort((a, b) => naturalCompare(a.element_identifier, b.element_identifier))
    .map((e) => {
      const parentSr = (cprt.projTo.get(e.element_identifier) ?? []).find((s) => s.startsWith(SR));
      return {
        identifier: e.element_identifier.slice(DS.length),
        text: e.text.trim(),
        partLabel: parentSr ? partLabel(parentSr, slot) : '',
      };
    });

  return {
    slot,
    title: titleOf(cprt, slot),
    familyR3: slot.slice(0, 5),
    parts,
    discussion: textOf(cprt, `D-${slot}`),
    examine: textOf(cprt, `E-${slot}`),
    interview: textOf(cprt, `I-${slot}`),
    test: textOf(cprt, `T-${slot}`),
    odps,
    determinations,
  };
}

export function flattenRequirement(req: Rev3Requirement): string {
  return req.parts.map((p) => (p.label ? `${p.label}. ${p.text}` : p.text)).join('\n');
}

function methodsSection(req: Rev3Requirement): string {
  return [
    'Assessment methods and objects (NIST SP 800-171A Rev 3):',
    req.examine ? `Examine: ${req.examine}` : null,
    req.interview ? `Interview: ${req.interview}` : null,
    req.test ? `Test: ${req.test}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join('\n');
}

function odpSection(req: Rev3Requirement): string | null {
  if (req.odps.length === 0) return null;
  const lines = req.odps.map((o) => {
    const bracket = o.identifier.slice(o.identifier.indexOf('ODP'));
    const placeholder = o.statement ? ` (${o.statement})` : '';
    return `${bracket}${o.title ? ` ${o.title}` : ''}${placeholder}: ${o.text}`;
  });
  return `Organization-defined parameters:\n${lines.join('\n')}`;
}

export function buildRev3(args: { familyId: string; cprt: CprtDoc }): Rev3Build {
  const { familyId, cprt } = args;
  const frameworkId = ids.framework('r3');
  const framework: FrameworkRow = { id: frameworkId, familyId, ...REV3_FRAMEWORK };
  const withdrawn = new Map<string, string>();
  for (const wr of elementsOf(cprt, 'withdraw_reason')) {
    withdrawn.set(wr.element_identifier.slice(3), wr.text.trim());
  }
  const familyTitle = new Map(
    elementsOf(cprt, 'family').map((f) => [f.element_identifier, f.title.trim()]),
  );
  const slots = new Map<string, Rev3Requirement>();
  const activeIds = elementsOf(cprt, 'requirement')
    .map((e) => e.element_identifier)
    .filter((id) => !withdrawn.has(id))
    .sort(naturalCompare);
  for (const slot of activeIds) slots.set(slot, collectSlot(cprt, slot));

  const rows: RequirementRow[] = [];
  const parentOf = new Map<string, string>();
  for (const req of slots.values()) {
    const fam = familyByR3(req.slot);
    const famIndex = FAMILIES.indexOf(fam) + 1;
    const reqNum = Number.parseInt(req.slot.split('.')[2] ?? '0', 10);
    const label = familyLabel(fam, familyTitle.get(req.familyR3) ?? fam.name);
    const heading = `${req.slot} ${req.title}`;
    const full = `Security requirement ${heading}:\n${flattenRequirement(req)}`;
    const shared = [
      odpSection(req),
      methodsSection(req),
      req.discussion ? `Discussion: ${req.discussion}` : null,
      `Family: ${label}.`,
    ];
    let seq = 0;
    const partText = new Map(req.parts.map((p) => [p.label, p.text]));

    for (const odp of req.odps) {
      seq += 1;
      const id = ids.requirement('r3', odp.identifier);
      rows.push({
        id,
        frameworkId,
        name: truncate(sentenceCase(stripTrailingPeriod(odp.text)), 200),
        identifier: odp.identifier,
        description: joinSections([
          `Assessment objective ${odp.identifier}: ${odp.text}`,
          odp.statement ? `Organization-defined parameter: ${odp.statement}.` : null,
          full,
          ...shared,
        ]),
        requirementFamily: label,
        sortOrder: famIndex * 100000 + reqNum * 1000 + seq,
      });
      parentOf.set(id, req.slot);
    }
    for (const det of req.determinations) {
      seq += 1;
      const id = ids.requirement('r3', det.identifier);
      const part = det.partLabel ? partText.get(det.partLabel) : undefined;
      rows.push({
        id,
        frameworkId,
        name: truncate(sentenceCase(stripTrailingPeriod(det.text)), 200),
        identifier: det.identifier,
        description: joinSections([
          `Assessment objective ${det.identifier}: ${det.text}`,
          part ? `Security requirement ${heading}, part ${det.partLabel}: ${part}` : null,
          full,
          ...shared,
        ]),
        requirementFamily: label,
        sortOrder: famIndex * 100000 + reqNum * 1000 + seq,
      });
      parentOf.set(id, req.slot);
    }
  }
  return { framework, requirements: rows, slots, withdrawn, parentOf };
}
