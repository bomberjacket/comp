import { ids as csetIds } from '../cset/ids';
import { ids } from './ids';
import { PLANS, buildPlanPolicies } from './plans';
import type {
  AnswerProfile,
  Cpg2Goal,
  CpgPractice,
  CrosswalkRow,
  FamilyRow,
  FrameworkRow,
  InterviewQuestion,
  Pair,
  PolicyLinkRow,
  PolicyRow,
  RequirementRow,
  TaskLinkRow,
  TaskRow,
  WcatJson,
} from './types';

export const FRAMEWORK_NAME = 'Water and Wastewater Cybersecurity (EPA checklist on CISA CPG 2.0)';
export const FRAMEWORK_VERSION = 'WCAT 3.1 / CPG 2.0';
const ATTRIBUTION =
  'EPA Water Cybersecurity Assessment Tool 3.1 (public domain); CISA CPG 1.0.1 component listing (public domain); ' +
  'crosswalk to CISA CPG 2.0 by BomberJacket Networks';

/**
 * Interview questions are tagged to the CPG 2.0 goal they really belong to; a goal the
 * EPA checklist never reaches is asked under its nearest goal in this framework.
 */
const INTERVIEW_FALLBACK: Record<string, string> = {
  '1.B': '1.A',
  '1.D': '1.E',
  '2.C': '1.A',
  '3.H': '3.G',
  '4.A': '4.B',
  '5.A': '5.B',
};

export interface WaterBuild {
  family: FamilyRow;
  framework: FrameworkRow;
  requirements: RequirementRow[];
  policies: PolicyRow[];
  tasks: TaskRow[];
  policyLinks: PolicyLinkRow[];
  taskLinks: TaskLinkRow[];
  controlRequirementPairs: Pair[];
  controlPolicyPairs: Pair[];
  controlTaskPairs: Pair[];
  profile: AnswerProfile;
  /** CPG 2.0 control template ids the framework borrows (must exist in the CSET set) */
  borrowedControlIds: string[];
  /** CPG 2.0 evidence task template ids the framework borrows */
  borrowedTaskIds: string[];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function requirementDescription(
  item: WcatJson['items'][number],
  cross: CrosswalkRow,
  goals: Map<string, Cpg2Goal>,
  practice: CpgPractice | undefined,
): string {
  const goal = goals.get(cross.cpg2Goal);
  const secondary = cross.secondaryGoals
    .map((g) => goals.get(g))
    .filter((g): g is Cpg2Goal => !!g)
    .map((g) => `${g.id} ${g.practice}`);
  const parts = [
    `EPA checklist question ${item.id}${item.epaPriority ? ' (EPA priority cybersecurity practice)' : ''}: ${item.question}`,
    `Recommendation (EPA): ${item.recommendation}`,
    `CISA CPG 2.0 goal: ${goal ? `${goal.id} ${goal.practice} (${goal.function})` : cross.cpg2Goal}` +
      (secondary.length > 0 ? `; also ${secondary.join('; ')}` : '') +
      '. The control and its evidence task are shared with the CPG 2.0 framework, so evidence collected once counts for both.' +
      (cross.note ? ` Crosswalk note: ${cross.note}.` : ''),
  ];
  if (practice) {
    const facts = [
      `Outcome: ${practice.outcome}`,
      practice.riskAddressed ? `Risk addressed: ${practice.riskAddressed}` : '',
      practice.scope ? `Scope: ${practice.scope}` : '',
      practice.csfReference ? `NIST CSF: ${practice.csfReference.split('\n')[0]}` : '',
      [practice.cost && `cost ${practice.cost}`, practice.impact && `impact ${practice.impact}`, practice.complexity && `complexity ${practice.complexity}`]
        .filter(Boolean)
        .join(', '),
    ].filter(Boolean);
    parts.push(`CPG 1.0.1 practice ${practice.id} ${practice.securityPractice}. ${facts.join('. ')}.`);
  }
  if (item.factsheetUrl) parts.push(`EPA fact sheet: ${item.factsheetUrl}`);
  parts.push(`Source: ${ATTRIBUTION}.`);
  return parts.join('\n\n');
}

export function build(args: {
  wcat: WcatJson;
  practices: Map<string, CpgPractice>;
  crosswalk: Map<string, CrosswalkRow>;
  interview: InterviewQuestion[];
  goals: Map<string, Cpg2Goal>;
}): WaterBuild {
  const { wcat, practices, crosswalk, interview, goals } = args;
  const family: FamilyRow = {
    id: ids.family(),
    name: 'Water sector (BNI method)',
    description:
      "BomberJacket Networks' assessment method for drinking water and wastewater utilities: EPA's cybersecurity " +
      'checklist answered on the CISA Cybersecurity Performance Goals 2.0 backbone, with AWWA-structured plans, ' +
      "CISA tabletop interview questions and EPA's procurement checklist for suppliers and integrators.",
    status: 'visible',
  };
  const frameworkId = ids.framework();
  const framework: FrameworkRow = {
    id: frameworkId,
    name: FRAMEWORK_NAME,
    version: FRAMEWORK_VERSION,
    description:
      "EPA's Cybersecurity Checklist for Drinking Water and Wastewater Systems (WCAT 3.1, 33 questions, 16 EPA " +
      'priority practices) answered Yes / In progress / No / Not applicable, each question mapped to the CISA CPG 2.0 ' +
      'goal that owns its control and evidence task. Includes a Cybersecurity Risk Management Plan and a Cyber ' +
      'Incident Response Plan structured after the AWWA 2025 templates, and interview questions from the CISA ' +
      'water-sector tabletop exercise package. Sources are public domain (EPA, CISA); crosswalk by BomberJacket Networks.',
    visible: true,
    familyId: family.id,
  };

  const requirements: RequirementRow[] = [];
  const controlRequirementPairs: Pair[] = [];
  const goalsUsed = new Map<string, Cpg2Goal>();
  const sorted = [...wcat.items].sort((a, b) => a.functionNumber - b.functionNumber || a.id.localeCompare(b.id));
  sorted.forEach((item, i) => {
    const cross = crosswalk.get(item.id);
    if (!cross) throw new Error(`no CPG 2.0 crosswalk for EPA checklist item ${item.id}`);
    const goal = goals.get(cross.cpg2Goal);
    if (!goal) throw new Error(`crosswalk for ${item.id} names unknown CPG 2.0 goal ${cross.cpg2Goal}`);
    goalsUsed.set(goal.id, goal);
    const id = ids.requirement(item.id);
    requirements.push({
      id,
      frameworkId,
      name: truncate(`${item.id} ${item.question}`, 200),
      identifier: item.id,
      description: requirementDescription(item, cross, goals, practices.get(item.id)),
      requirementFamily: `${item.functionNumber} - ${item.function}`,
      sortOrder: (i + 1) * 10,
    });
    controlRequirementPairs.push({ A: csetIds.control('cpg2', `q:${goal.id}`), B: id });
  });

  const policies = buildPlanPolicies(FRAMEWORK_NAME, 'it', 'yearly');
  const policyOfFunction = new Map<string, string>();
  for (const plan of PLANS) for (const fn of plan.functions) policyOfFunction.set(fn, ids.policy(plan.key));

  const questionsByGoal = new Map<string, InterviewQuestion[]>();
  for (const q of interview) {
    const goal = goalsUsed.has(q.cpg2Goal) ? q.cpg2Goal : INTERVIEW_FALLBACK[q.cpg2Goal];
    if (!goal || !goalsUsed.has(goal)) throw new Error(`interview question for ${q.cpg2Goal} has no goal in this framework`);
    questionsByGoal.set(goal, [...(questionsByGoal.get(goal) ?? []), q]);
  }

  const tasks: TaskRow[] = [];
  const taskLinks: TaskLinkRow[] = [];
  const policyLinks: PolicyLinkRow[] = [];
  const controlPolicyPairs: Pair[] = [];
  const controlTaskPairs: Pair[] = [];
  const borrowedControlIds: string[] = [];
  const borrowedTaskIds: string[] = [];
  for (const goal of [...goalsUsed.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const controlId = csetIds.control('cpg2', `q:${goal.id}`);
    const evidenceTaskId = csetIds.task('cpg2', `q:${goal.id}`);
    borrowedControlIds.push(controlId);
    borrowedTaskIds.push(evidenceTaskId);
    taskLinks.push({ id: ids.taskLink(goal.id, 'evidence'), frameworkId, controlTemplateId: controlId, taskTemplateId: evidenceTaskId });
    const policyId = policyOfFunction.get(goal.function);
    if (!policyId) throw new Error(`no plan covers CPG 2.0 function ${goal.function}`);
    policyLinks.push({ id: ids.policyLink(goal.id, policyId), frameworkId, controlTemplateId: controlId, policyTemplateId: policyId });
    controlPolicyPairs.push({ A: controlId, B: policyId });

    const questions = questionsByGoal.get(goal.id);
    if (!questions) continue;
    const taskId = ids.interviewTask(goal.id);
    const grouped = new Map<string, string[]>();
    for (const q of questions) grouped.set(q.section, [...(grouped.get(q.section) ?? []), q.question]);
    tasks.push({
      id: taskId,
      name: truncate(`Interview evidence: ${goal.id} ${goal.practice}`, 255),
      description: [
        `Interview or tabletop evidence for CPG 2.0 goal ${goal.id} ${goal.practice} under the ${FRAMEWORK_NAME}. ` +
          'Ask the questions below of the utility staff who own the practice; record who answered, the date and the answers, ' +
          'and attach exercise notes or the after-action report when the questions were covered in a tabletop.',
        ...[...grouped.entries()].map(([section, qs]) => `${section}:\n${qs.map((q) => `- ${q}`).join('\n')}`),
        'Source: CISA Water and Wastewater Systems Cybersecurity Tabletop Exercise Package (CTEP) Situation Manual, November 2023 (public domain); selection and goal tags by BomberJacket Networks.',
      ].join('\n\n'),
      frequency: 'yearly',
      department: 'it',
      automationStatus: 'MANUAL',
    });
    controlTaskPairs.push({ A: controlId, B: taskId });
    taskLinks.push({ id: ids.taskLink(goal.id, 'interview'), frameworkId, controlTemplateId: controlId, taskTemplateId: taskId });
  }

  return {
    family,
    framework,
    requirements,
    policies,
    tasks,
    policyLinks,
    taskLinks,
    controlRequirementPairs,
    controlPolicyPairs,
    controlTaskPairs,
    profile: { id: ids.answerProfile(), frameworkId, module: 'wcat', answerOptions: ['Y', 'I', 'N', 'NA'], domainMode: 'single', scoring: 'standard' },
    borrowedControlIds,
    borrowedTaskIds,
  };
}
