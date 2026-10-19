import { ids } from './ids';
import { projected, textOf } from './read-cprt';
import {
  FAMILIES,
  familyByR2,
  familyLabel,
  joinSections,
  naturalCompare,
  sentenceCase,
  stripTrailingPeriod,
  truncate,
} from './text';
import type {
  ChangeRow,
  CprtDoc,
  Disposition,
  FrameworkRow,
  RequirementRow,
  Rev2Objective,
  Rev2Requirement,
} from './types';

export interface Rev2Build {
  framework: FrameworkRow;
  requirements: RequirementRow[];
  /** requirement row id -> Rev 2 requirement id (3.1.1) */
  parentOf: Map<string, string>;
  /** requirement row id -> objective identifier (3.1.1[a]) */
  objectiveOf: Map<string, string>;
}

export const REV2_FRAMEWORK: Omit<FrameworkRow, 'id' | 'familyId'> = {
  name: 'NIST SP 800-171 Rev 2',
  version: '2.0',
  description:
    'Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations, ' +
    'Revision 2 (February 2020, updated January 2021). 14 families, 110 security requirements, ' +
    '320 assessment objectives from NIST SP 800-171A. This is the baseline assessed under CMMC Level 2.',
  visible: true,
};

function dispositionLine(d: Disposition, r3Titles: Map<string, string>): string {
  const named = (slots: string[]): string =>
    slots.map((s) => `${s} ${r3Titles.get(s) ?? ''}`.trim()).join(', ');
  switch (d.kind) {
    case 'carried':
      return `Rev 3 disposition: carried forward as ${named([d.slot])}.`;
    case 'incorporated':
      return `Rev 3 disposition: withdrawn in Rev 3 and incorporated into ${named(d.targets)}.`;
    case 'addressed_by':
      return `Rev 3 disposition: withdrawn in Rev 3; addressed by ${named(d.targets)}.`;
    case 'withdrawn':
      return `Rev 3 disposition: withdrawn in Rev 3 (${stripTrailingPeriod(d.reason)}).`;
  }
}

function requirementType(cprt: CprtDoc, r2Id: string): string {
  const types = projected(cprt, r2Id, 'RT_');
  if (types.includes('RT_basic')) return 'basic';
  if (types.includes('RT_derived')) return 'derived';
  return 'unspecified';
}

export function buildRev2(args: {
  familyId: string;
  cprt: CprtDoc;
  requirements: Rev2Requirement[];
  objectives: Rev2Objective[];
  dispositions: Map<string, Disposition>;
  changes: Map<string, ChangeRow>;
  r3Titles: Map<string, string>;
}): Rev2Build {
  const { familyId, cprt, requirements, objectives, dispositions, changes, r3Titles } = args;
  const frameworkId = ids.framework('r2');
  const framework: FrameworkRow = { id: frameworkId, familyId, ...REV2_FRAMEWORK };
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const parentOf = new Map<string, string>();
  const objectiveOf = new Map<string, string>();
  const rows: RequirementRow[] = [];

  const sorted = [...objectives].sort(
    (a, b) => naturalCompare(a.requirementId, b.requirementId) || a.seq - b.seq,
  );
  for (const obj of sorted) {
    const req = reqById.get(obj.requirementId);
    if (!req) throw new Error(`Objective ${obj.identifier} has no requirement row`);
    const fam = familyByR2(req.id);
    const famIndex = FAMILIES.indexOf(fam) + 1;
    const reqNum = Number.parseInt(req.id.split('.')[2] ?? '0', 10);
    const disposition = dispositions.get(req.id);
    if (!disposition) throw new Error(`No Rev 3 disposition for ${req.id}`);
    const change = changes.get(req.id);
    const type = requirementType(cprt, req.id);
    const discussion = textOf(cprt, `D_${req.id}`);
    const label = familyLabel(fam, req.familyName || fam.name);

    const description = joinSections([
      `Assessment objective ${obj.identifier}: ${obj.text}`,
      `Security requirement ${req.id} (${type}): ${req.text}`,
      discussion ? `Discussion: ${discussion}` : null,
      [
        'Assessment methods and objects (NIST SP 800-171A Rev 2):',
        req.examine ? `Examine: ${req.examine}` : null,
        req.interview ? `Interview: ${req.interview}` : null,
        req.test ? `Test: ${req.test}` : null,
      ]
        .filter((s): s is string => s !== null)
        .join('\n'),
      dispositionLine(disposition, r3Titles),
      change?.summary
        ? `NIST change analysis (Rev 2 to Rev 3): ${change.summary}` +
          (change.flags.length ? ` [${change.flags.join('; ')}]` : '')
        : null,
      `Family: ${label}.`,
    ]);

    const id = ids.requirement('r2', obj.identifier);
    rows.push({
      id,
      frameworkId,
      name: truncate(sentenceCase(stripTrailingPeriod(obj.text)), 200),
      identifier: obj.identifier,
      description,
      requirementFamily: label,
      sortOrder: famIndex * 100000 + reqNum * 1000 + obj.seq,
    });
    parentOf.set(id, req.id);
    objectiveOf.set(id, obj.identifier);
  }
  return { framework, requirements: rows, parentOf, objectiveOf };
}
