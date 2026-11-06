import { ids } from './ids';
import { buildPolicyContent } from './policy-content';
import { departmentFor, truncate } from './text';
import type {
  AnswerProfile,
  BuiltRequirement,
  ControlRow,
  FrameworkRow,
  GeneratedData,
  ModuleBuild,
  Pair,
  PolicyLinkRow,
  PolicyRow,
  RequirementRow,
  TaskLinkRow,
  TaskRow,
} from './types';

export interface ModuleRows {
  framework: FrameworkRow;
  requirements: RequirementRow[];
  controls: ControlRow[];
  policies: PolicyRow[];
  tasks: TaskRow[];
  policyLinks: PolicyLinkRow[];
  taskLinks: TaskLinkRow[];
  controlRequirementPairs: Pair[];
  controlPolicyPairs: Pair[];
  controlTaskPairs: Pair[];
  profile: AnswerProfile;
}

const TASK_GUIDANCE: Record<string, string> = {
  cpg: 'Record the answer per domain (IT, OT) against the implementation criteria in each goal, and attach the artefact that shows it: policy, configuration export, screenshot, inventory, training record or exercise report.',
  mil: 'Answer each practice Yes only when it is performed consistently and evidenced; Incomplete when partly performed. Attach the policy, procedure, record or system output that demonstrates the practice.',
  tier: 'Answer each practice against its tier. Attach the configuration, record or report that demonstrates it.',
  standard: 'Answer each requirement Yes, No, Not applicable (with justification) or Alternate (describe the compensating control). Attach the document or system output that demonstrates it.',
};

/** Turns one module's built requirements into seed rows and relation pairs with stable ids. */
export function toRows(build: ModuleBuild, familyId: string): ModuleRows {
  const { module, requirements, families } = build;
  const frameworkId = ids.framework(module.key);
  const framework: FrameworkRow = {
    id: frameworkId,
    name: module.name,
    version: module.version,
    description: module.description,
    visible: true,
    familyId,
  };

  const rows: RequirementRow[] = [];
  const controls = new Map<string, ControlRow>();
  const controlFamily = new Map<string, string>();
  const controlSummaries = new Map<string, string[]>();
  const controlRequirementPairs: Pair[] = [];

  requirements.forEach((r, i) => {
    const controlId = ids.control(module.key, r.controlKey);
    if (!controls.has(r.controlKey)) {
      controls.set(r.controlKey, {
        id: controlId,
        name: truncate(r.controlName, 255),
        description: r.controlDescription,
        controlFamily: r.familyLabel,
      });
      controlFamily.set(r.controlKey, r.familyKey);
      controlSummaries.set(r.controlKey, []);
    }
    controlSummaries.get(r.controlKey)?.push(r.summary);
    const id = ids.requirement(module.key, r.identifier);
    rows.push({
      id,
      frameworkId,
      name: r.name,
      identifier: r.identifier,
      description: r.description,
      requirementFamily: r.familyLabel,
      sortOrder: (i + 1) * 10,
    });
    controlRequirementPairs.push({ A: controlId, B: id });
  });

  // One policy per family, listing the family's controls.
  const policies: PolicyRow[] = [];
  const policyIdOfFamily = new Map<string, string>();
  for (const [familyKey, label] of families) {
    const statements = [...controls.entries()]
      .filter(([key]) => controlFamily.get(key) === familyKey)
      .map(([, c]) => c.name);
    const id = ids.policy(module.key, familyKey);
    policyIdOfFamily.set(familyKey, id);
    const area = label.includes(' - ') ? (label.split(' - ')[1] as string) : label;
    policies.push({
      id,
      name: truncate(`${area} Policy (${module.name})`, 255),
      description: `Establishes ${area.toLowerCase()} practices under the ${module.name} (${module.attribution}).`,
      frequency: 'yearly',
      department: departmentFor(area, module.defaultDepartment),
      content: buildPolicyContent({ family: area, framework: module.name, attribution: module.attribution, statements }),
    });
  }

  const tasks: TaskRow[] = [];
  const taskLinks: TaskLinkRow[] = [];
  const policyLinks: PolicyLinkRow[] = [];
  const controlPolicyPairs: Pair[] = [];
  const controlTaskPairs: Pair[] = [];
  for (const [key, c] of controls) {
    const familyKey = controlFamily.get(key) as string;
    const familyLabel = families.get(familyKey) as string;
    const policyId = policyIdOfFamily.get(familyKey) as string;
    const dept = departmentFor(familyLabel, module.defaultDepartment);
    const taskId = ids.task(module.key, key);
    const items = controlSummaries.get(key) ?? [];
    tasks.push({
      id: taskId,
      name: truncate(`Evidence: ${c.name}`, 255),
      description: [
        `Collect evidence for ${c.name} (${module.name}).`,
        `Items: ${items.join('; ')}.`,
        TASK_GUIDANCE[module.scoring] ?? '',
        `Source: ${module.attribution}.`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      frequency: module.taskFrequency,
      department: dept,
      automationStatus: 'MANUAL',
    });
    controlTaskPairs.push({ A: c.id, B: taskId });
    taskLinks.push({ id: ids.taskLink(module.key, key), frameworkId, controlTemplateId: c.id, taskTemplateId: taskId });
    controlPolicyPairs.push({ A: c.id, B: policyId });
    policyLinks.push({
      id: ids.policyLink(module.key, key, familyKey),
      frameworkId,
      controlTemplateId: c.id,
      policyTemplateId: policyId,
    });
  }

  return {
    framework,
    requirements: rows,
    controls: [...controls.values()],
    policies,
    tasks,
    policyLinks,
    taskLinks,
    controlRequirementPairs,
    controlPolicyPairs,
    controlTaskPairs,
    profile: {
      frameworkId,
      module: module.key,
      answerOptions: module.answerOptions,
      domainMode: module.domainMode,
      scoring: module.scoring,
    },
  };
}

export function merge(familyRow: GeneratedData['families'][number], parts: ModuleRows[]): GeneratedData {
  return {
    families: [familyRow],
    frameworks: parts.map((p) => p.framework),
    requirements: parts.flatMap((p) => p.requirements),
    controls: parts.flatMap((p) => p.controls),
    policies: parts.flatMap((p) => p.policies),
    tasks: parts.flatMap((p) => p.tasks),
    policyLinks: parts.flatMap((p) => p.policyLinks),
    taskLinks: parts.flatMap((p) => p.taskLinks),
    controlRequirementPairs: parts.flatMap((p) => p.controlRequirementPairs),
    controlPolicyPairs: parts.flatMap((p) => p.controlPolicyPairs),
    controlTaskPairs: parts.flatMap((p) => p.controlTaskPairs),
  };
}
