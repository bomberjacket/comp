import { artifactSection, bucketArtifacts, type ArtifactListRow } from './artifacts';
import { splitKey, type ControlsBuild } from './build-controls';
import type { Rev2Build } from './build-rev2';
import type { Rev3Build } from './build-rev3';
import { ids } from './ids';
import { buildPolicyContent } from './policy-content';
import {
  FAMILIES,
  familyByR2,
  familyByR3,
  sentenceCase,
  stripTrailingPeriod,
  toCompFrequency,
  truncate,
} from './text';
import type {
  FamilyDef,
  Frequency,
  FrequencyRow,
  Pair,
  PolicyLinkRow,
  PolicyRow,
  RequirementRow,
  Rev2Requirement,
  Revision,
  TaskLinkRow,
  TaskRow,
} from './types';

export interface PolicyTaskBuild {
  policies: PolicyRow[];
  tasks: TaskRow[];
  policyLinks: PolicyLinkRow[];
  taskLinks: TaskLinkRow[];
  controlPolicyPairs: Pair[];
  controlTaskPairs: Pair[];
  artifactRows: ArtifactListRow[];
}

function familyOfKey(key: string): FamilyDef {
  const [rev, reqId] = splitKey(key);
  return rev === 'r2' ? familyByR2(reqId) : familyByR3(reqId);
}

function firstSentence(text: string): string {
  const first = text.split('\n')[0] ?? text;
  return truncate(first, 240);
}

/** `3.1.1[a] Authorized users are identified` (255-char column). */
function taskName(identifier: string, objectiveText: string): string {
  const text = sentenceCase(stripTrailingPeriod(objectiveText));
  return truncate(`${identifier} ${text}`, 255);
}

const ODP_GUIDANCE =
  'This objective is an organization-defined parameter. Evidence is the value the organization ' +
  'selected, where it is documented (system security plan or the family policy) and where it is ' +
  'enforced. Record the value in the task and attach the document that states it.';

const NO_OBJECTS_NOTE =
  "NIST's machine-readable export lists no examine or test objects for this requirement; " +
  'use the assessment procedure in the SP 800-171A PDF to choose the artifacts.';

export function buildPoliciesAndTasks(args: {
  controls: ControlsBuild;
  rev2: Rev2Build;
  rev3: Rev3Build;
  requirementsR2: Rev2Requirement[];
  frequencies: Map<string, FrequencyRow>;
}): PolicyTaskBuild {
  const { controls, rev2, rev3, requirementsR2, frequencies } = args;
  const reqR2 = new Map(requirementsR2.map((r) => [r.id, r]));
  const keyOfId = new Map([...controls.idOfKey.entries()].map(([k, v]) => [v, k]));
  const frameworkIdOf: Record<Revision, string> = { r2: rev2.framework.id, r3: rev3.framework.id };

  // Policies: one per Rev 3 family, shared by both revisions. Statements come from the
  // Rev 3 controls (the current NIST text); Rev 2 controls link to their own family.
  const policies: PolicyRow[] = [];
  const policyIdOfFamily = new Map<string, string>();
  for (const fam of FAMILIES) {
    const inFamily = controls.controls
      .filter((c) => {
        const key = keyOfId.get(c.id) ?? '';
        return key.startsWith('r3:') && familyOfKey(key).r3 === fam.r3;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const statements = inFamily.map((c) => `${c.name}: ${firstSentence(c.description)}`);
    const id = ids.policy(fam.r3);
    policyIdOfFamily.set(fam.r3, id);
    policies.push({
      id,
      name: `${fam.name} Policy (NIST SP 800-171)`,
      description:
        `Establishes ${fam.name.toLowerCase()} requirements for systems that handle CUI under ` +
        `NIST SP 800-171 ${fam.r2 ? `Rev 2 (family ${fam.r2}) and ` : ''}Rev 3 (family ${fam.r3}).`,
      frequency: 'yearly',
      department: fam.department,
      content: buildPolicyContent(fam, statements),
    });
  }

  // Tasks: one per assessment objective (requirement row).
  const tasks: TaskRow[] = [];
  const taskLinks: TaskLinkRow[] = [];
  const controlTaskPairs: Pair[] = [];
  const artifactRows: ArtifactListRow[] = [];

  const addTask = (
    rev: Revision,
    row: RequirementRow,
    objectiveText: string,
    parentLine: string,
    examine: string,
    test: string,
    frequency: Frequency,
    frequencyNote: string | null,
    isOdp: boolean,
  ): void => {
    const key = controls.controlKeyOfRow.get(row.id);
    const controlId = key ? controls.idOfKey.get(key) : undefined;
    if (!key || !controlId) throw new Error(`No control for row ${row.identifier}`);
    const fam = familyOfKey(key);
    const buckets = bucketArtifacts(examine, test);
    const id = ids.task(rev, row.identifier);
    tasks.push({
      id,
      name: taskName(row.identifier, objectiveText),
      description: [
        `Assessment objective ${row.identifier}: ${objectiveText}`,
        parentLine,
        isOdp ? ODP_GUIDANCE : null,
        artifactSection(buckets) || NO_OBJECTS_NOTE,
        frequencyNote,
      ]
        .filter((s): s is string => s !== null && s !== '')
        .join('\n\n'),
      frequency,
      department: fam.department,
      automationStatus: 'MANUAL',
    });
    controlTaskPairs.push({ A: controlId, B: id });
    taskLinks.push({
      id: ids.taskLink(rev, row.identifier),
      frameworkId: frameworkIdOf[rev],
      controlTemplateId: controlId,
      taskTemplateId: id,
    });
    artifactRows.push({
      revision: rev,
      family: row.requirementFamily,
      requirement: splitKey(key)[1],
      objective: row.identifier,
      objectiveText,
      frequency,
      buckets,
    });
  };

  for (const row of rev2.requirements) {
    const r2Id = rev2.parentOf.get(row.id);
    const req = r2Id ? reqR2.get(r2Id) : undefined;
    if (!r2Id || !req) throw new Error(`Rev 2 row ${row.identifier} has no requirement`);
    const objectiveText = row.name;
    const level = frequencies.get(row.identifier);
    const frequency = level ? toCompFrequency(level.frequency) : 'quarterly';
    addTask(
      'r2',
      row,
      objectiveText,
      `Security requirement ${r2Id}: ${req.text}`,
      req.examine,
      req.test,
      frequency,
      level
        ? `BNI recommended monitoring level: ${level.frequency}${level.rationale ? ` (${level.rationale})` : ''}. ` +
            "Adjust the task frequency to this organization's cadence."
        : null,
      false,
    );
  }

  for (const row of rev3.requirements) {
    const slot = rev3.parentOf.get(row.id);
    const req = slot ? rev3.slots.get(slot) : undefined;
    if (!slot || !req) throw new Error(`Rev 3 row ${row.identifier} has no requirement`);
    const isOdp = row.identifier.includes('.ODP[');
    const det = req.determinations.find((d) => d.identifier === row.identifier);
    const partText = det?.partLabel
      ? req.parts.find((p) => p.label === det.partLabel)?.text
      : undefined;
    addTask(
      'r3',
      row,
      row.name,
      partText
        ? `Security requirement ${slot} ${req.title}, part ${det?.partLabel}: ${partText}`
        : `Security requirement ${slot} ${req.title}.`,
      req.examine,
      req.test,
      isOdp ? 'yearly' : 'quarterly',
      isOdp
        ? null
        : 'Default cadence is quarterly until BNI sets Rev 3 monitoring levels; adjust per organization.',
      isOdp,
    );
  }

  // Policy links: every control links to its family policy, scoped to its framework.
  const policyLinks: PolicyLinkRow[] = [];
  const controlPolicyPairs: Pair[] = [];
  for (const rev of ['r2', 'r3'] as const) {
    for (const key of controls.keysByRevision[rev]) {
      const fam = familyOfKey(key);
      const controlTemplateId = controls.idOfKey.get(key);
      const policyTemplateId = policyIdOfFamily.get(fam.r3);
      if (!controlTemplateId || !policyTemplateId) throw new Error(`No policy link for ${key}`);
      controlPolicyPairs.push({ A: controlTemplateId, B: policyTemplateId });
      policyLinks.push({
        id: ids.policyLink(rev, splitKey(key)[1], fam.r3),
        frameworkId: frameworkIdOf[rev],
        controlTemplateId,
        policyTemplateId,
      });
    }
  }

  return {
    policies,
    tasks,
    policyLinks,
    taskLinks,
    controlPolicyPairs,
    controlTaskPairs,
    artifactRows,
  };
}
