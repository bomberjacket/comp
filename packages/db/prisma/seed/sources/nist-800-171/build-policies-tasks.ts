import { r2IdOfKey, type ControlsBuild } from './build-controls';
import type { Rev2Build } from './build-rev2';
import type { Rev3Build } from './build-rev3';
import { ids } from './ids';
import {
  FAMILIES,
  dominantFrequency,
  familyByR2,
  familyByR3,
  toCompFrequency,
  truncate,
} from './text';
import type {
  ControlRow,
  FamilyDef,
  FrequencyRow,
  Pair,
  PolicyLinkRow,
  PolicyRow,
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
}

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

const heading = (text: string): Node => ({
  type: 'heading',
  attrs: { level: 2, textAlign: null },
  content: [{ type: 'text', text }],
});
const paragraph = (text: string): Node => ({
  type: 'paragraph',
  attrs: { textAlign: null },
  content: [{ type: 'text', text }],
});
const bullets = (items: string[]): Node => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })),
});

function familyOfKey(key: string): FamilyDef {
  const r2Id = r2IdOfKey(key);
  return r2Id ? familyByR2(r2Id) : familyByR3(key);
}

/**
 * Structural TipTap policy document. Section order follows the upstream templates
 * (Purpose, Scope, Policy, Roles and Responsibilities, Compliance Measurement,
 * Exceptions, Non-Compliance, Review). Prose is a draft for CCA review.
 */
export function buildPolicyContent(fam: FamilyDef, statements: string[]): Node {
  const area = fam.name.toLowerCase();
  return {
    type: 'doc',
    content: [
      heading('Purpose'),
      paragraph(
        `This policy establishes {{COMPANY}}'s requirements for ${area} in accordance with the ` +
          `${fam.code} family of NIST SP 800-171 (Rev 2 family ${fam.r2 ?? 'n/a'}; Rev 3 family ${fam.r3}). ` +
          'It protects Controlled Unclassified Information (CUI) and Federal Contract Information (FCI) ' +
          "handled under {{COMPANY}}'s Department of Defense and other federal contracts.",
      ),
      heading('Scope'),
      paragraph(
        'This policy applies to all {{COMPANY}} systems, system components, facilities, and personnel ' +
          '(including contractors and third parties) that store, process, or transmit CUI, and to the ' +
          'security protection assets that support them, as defined in the CMMC assessment scope.',
      ),
      heading('Policy'),
      paragraph(`{{COMPANY}} shall implement and maintain the following ${area} requirements:`),
      bullets(statements),
      heading('Roles and Responsibilities'),
      paragraph(
        'The Information Security Officer owns this policy and its supporting procedures. System ' +
          'owners implement the requirements for their systems. All personnel comply with this policy ' +
          'and report suspected violations. The compliance function retains evidence of implementation.',
      ),
      heading('Compliance Measurement'),
      paragraph(
        'Compliance is verified through the evidence tasks linked to each control, periodic self-' +
          'assessment against NIST SP 800-171A, and CMMC assessments. Results are recorded in the ' +
          'System Security Plan and the Plan of Action and Milestones.',
      ),
      heading('Exceptions'),
      paragraph(
        'Exceptions require a documented risk acceptance approved by the Information Security Officer, ' +
          'an entry in the Plan of Action and Milestones, and a review date.',
      ),
      heading('Non-Compliance'),
      paragraph(
        'Violations may result in disciplinary action up to and including termination, and may be ' +
          'reportable to the contracting officer under the applicable contract clauses.',
      ),
      heading('Review'),
      paragraph(
        'This policy is reviewed at least annually and upon significant changes to systems, ' +
          'contracts, or the NIST SP 800-171 requirements.',
      ),
    ],
  };
}

function firstSentence(text: string): string {
  const first = text.split('\n')[0] ?? text;
  return truncate(first, 240);
}

export function buildPoliciesAndTasks(args: {
  controls: ControlsBuild;
  rev2: Rev2Build;
  rev3: Rev3Build;
  requirementsR2: Rev2Requirement[];
  frequencies: Map<string, FrequencyRow>;
}): PolicyTaskBuild {
  const { controls, rev2, rev3, requirementsR2, frequencies } = args;
  const reqR2 = new Map(requirementsR2.map((r) => [r.id, r]));
  const controlById = new Map(controls.controls.map((c) => [c.id, c]));
  const keyOfId = new Map([...controls.idOfKey.entries()].map(([k, v]) => [v, k]));

  // Rev 2 objectives (with BNI monitoring levels) grouped by control key.
  const objectivesByKey = new Map<string, Array<{ identifier: string; level: string }>>();
  for (const row of rev2.requirements) {
    const key = controls.controlKeyOfRow.get(row.id);
    const identifier = rev2.objectiveOf.get(row.id);
    if (!key || !identifier) continue;
    const level = frequencies.get(identifier)?.frequency ?? '';
    objectivesByKey.set(key, [...(objectivesByKey.get(key) ?? []), { identifier, level }]);
  }

  const policies: PolicyRow[] = [];
  const policyIdOfFamily = new Map<string, string>();
  for (const fam of FAMILIES) {
    const inFamily = controls.controls
      .filter((c) => familyOfKey(keyOfId.get(c.id) ?? '').r3 === fam.r3)
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

  const tasks: TaskRow[] = [];
  const taskIdOfKey = new Map<string, string>();
  for (const control of controls.controls) {
    const key = keyOfId.get(control.id);
    if (!key) throw new Error(`Control ${control.id} has no key`);
    const fam = familyOfKey(key);
    const r2Id = r2IdOfKey(key);
    const examine = r2Id ? reqR2.get(r2Id)?.examine : rev3.slots.get(key)?.examine;
    const objectives = objectivesByKey.get(key) ?? [];
    const levels = objectives.filter((o) => o.level).map((o) => toCompFrequency(o.level));
    const id = ids.task(key);
    taskIdOfKey.set(key, id);
    tasks.push({
      id,
      name: `Evidence: ${control.name}`,
      description: [
        `Collect and retain evidence that ${control.name} is implemented and operating.`,
        examine ? `Suggested evidence (NIST SP 800-171A examine objects): ${examine}` : null,
        objectives.length
          ? 'BNI recommended monitoring per Rev 2 objective: ' +
            objectives.map((o) => `${o.identifier} ${o.level || 'unset'}`).join('; ') +
            ". Adjust the task frequency to this organization's cadence."
          : 'No Rev 2 objective maps here (new in Rev 3); default cadence is quarterly until set.',
      ]
        .filter((s): s is string => s !== null)
        .join('\n\n'),
      frequency: dominantFrequency(levels, 'quarterly'),
      department: fam.department,
      automationStatus: 'MANUAL',
    });
  }

  const controlPolicyPairs: Pair[] = [];
  const controlTaskPairs: Pair[] = [];
  for (const control of controls.controls) {
    const key = keyOfId.get(control.id) ?? '';
    const policyId = policyIdOfFamily.get(familyOfKey(key).r3);
    const taskId = taskIdOfKey.get(key);
    if (!policyId || !taskId) throw new Error(`Missing policy or task for ${key}`);
    controlPolicyPairs.push({ A: control.id, B: policyId });
    controlTaskPairs.push({ A: control.id, B: taskId });
  }

  const policyLinks: PolicyLinkRow[] = [];
  const taskLinks: TaskLinkRow[] = [];
  const frameworkIdOf: Record<Revision, string> = { r2: rev2.framework.id, r3: rev3.framework.id };
  for (const rev of ['r2', 'r3'] as const) {
    for (const key of [...controls.keysByRevision[rev]].sort()) {
      const fam = familyOfKey(key);
      const controlTemplateId = controls.idOfKey.get(key);
      const policyTemplateId = policyIdOfFamily.get(fam.r3);
      const taskTemplateId = taskIdOfKey.get(key);
      if (!controlTemplateId || !policyTemplateId || !taskTemplateId) {
        throw new Error(`Missing link endpoints for ${rev} ${key}`);
      }
      policyLinks.push({
        id: ids.policyLink(rev, key, fam.r3),
        frameworkId: frameworkIdOf[rev],
        controlTemplateId,
        policyTemplateId,
      });
      taskLinks.push({
        id: ids.taskLink(rev, key),
        frameworkId: frameworkIdOf[rev],
        controlTemplateId,
        taskTemplateId,
      });
    }
  }

  void controlById;
  return { policies, tasks, policyLinks, taskLinks, controlPolicyPairs, controlTaskPairs };
}

export function controlsOf(controls: ControlsBuild): ControlRow[] {
  return controls.controls;
}
