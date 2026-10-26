import {
  CONDITIONAL_MIN_RATIO,
  POAM_EXCLUDED,
  requirementNumberOf,
  rev2PointValue,
  rev3PointValue,
  rev3ToRev2Number,
  type RequirementScoring,
} from './point-values';
import type {
  Level2Eligibility,
  Nist800171ScoreResult,
  ObjectiveOutcome,
  RequirementOutcome,
  ScoredObjective,
  ScoredRequirement,
} from './score.types';

/** Seeded framework ids (sha256 of "fw:r2" / "fw:r3", stable across installs). */
export const NIST_800_171_REV2_FRAMEWORK_ID = 'frk_094af66195e51e2ccd00e7e8';
export const NIST_800_171_REV3_FRAMEWORK_ID = 'frk_062c0788fae6f9494f86b876';

export interface ScoreInput {
  frameworkId: string | null;
  frameworkName: string | null;
  requirementDefinitions: { id: string; identifier: string }[];
  requirementMaps: { requirementId: string; controlId: string }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    controls: { id: string }[];
  }[];
}

export function detectRevision(
  frameworkId: string | null,
  name: string | null,
): 2 | 3 | null {
  if (frameworkId === NIST_800_171_REV2_FRAMEWORK_ID) return 2;
  if (frameworkId === NIST_800_171_REV3_FRAMEWORK_ID) return 3;
  const m = /800-171\s*(?:rev(?:ision)?\.?\s*)?([23])\b/i.exec(name ?? '');
  return m ? (Number(m[1]) as 2 | 3) : null;
}

/** The objective's evidence task: linked to its control, titled "<identifier> …". */
function findObjectiveTask<
  T extends { title: string; controls: { id: string }[] },
>(tasks: T[], controlIds: Set<string>, identifier: string): T | undefined {
  const id = identifier.trim();
  return tasks.find(
    (task) =>
      task.controls.some((control) => controlIds.has(control.id)) &&
      (task.title === id || task.title.startsWith(`${id} `)),
  );
}

function objectiveOutcome(status: string | null): ObjectiveOutcome {
  if (status === null) return 'no_task';
  if (status === 'done') return 'met';
  if (status === 'not_relevant') return 'not_applicable';
  return 'not_met';
}

function requirementOutcome(objectives: ScoredObjective[]): RequirementOutcome {
  if (objectives.every((o) => o.outcome === 'not_applicable'))
    return 'not_applicable';
  return objectives.every(
    (o) => o.outcome === 'met' || o.outcome === 'not_applicable',
  )
    ? 'met'
    : 'not_met';
}

function poamEligible(
  number: string,
  scoring: RequirementScoring,
  revision: 2 | 3,
): boolean {
  const rev2Number = revision === 2 ? number : rev3ToRev2Number(number);
  if (POAM_EXCLUDED.has(rev2Number)) return false;
  // 3.13.11 may sit on a POA&M at its partial value of 3; that condition is a
  // manual determination, so until an override exists it counts as ineligible.
  return scoring.points === 1;
}

export function computeNist800171Score(
  input: ScoreInput,
): Nist800171ScoreResult {
  const revision = detectRevision(input.frameworkId, input.frameworkName);
  if (!revision)
    return { supported: false, reason: 'Not a NIST SP 800-171 framework' };

  const controlsByRequirement = new Map<string, Set<string>>();
  for (const map of input.requirementMaps) {
    const set =
      controlsByRequirement.get(map.requirementId) ?? new Set<string>();
    set.add(map.controlId);
    controlsByRequirement.set(map.requirementId, set);
  }

  const objectivesByNumber = new Map<string, ScoredObjective[]>();
  for (const def of input.requirementDefinitions) {
    const number = requirementNumberOf(def.identifier, revision);
    if (!number) continue;
    const task = findObjectiveTask(
      input.tasks,
      controlsByRequirement.get(def.id) ?? new Set<string>(),
      def.identifier,
    );
    const list = objectivesByNumber.get(number) ?? [];
    list.push({
      requirementId: def.id,
      identifier: def.identifier,
      outcome: objectiveOutcome(task?.status ?? null),
      taskId: task?.id ?? null,
      taskStatus: task?.status ?? null,
    });
    objectivesByNumber.set(number, list);
  }

  const requirements: ScoredRequirement[] = [];
  for (const [number, objectives] of objectivesByNumber) {
    const scoring =
      revision === 2 ? rev2PointValue(number) : rev3PointValue(number);
    if (!scoring) continue;
    objectives.sort((a, b) =>
      a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
    );
    const outcome = requirementOutcome(objectives);
    const deduction =
      outcome === 'not_met' && !scoring.sspGate ? scoring.points : 0;
    requirements.push({
      number,
      points: scoring.points,
      partialPoints: scoring.partialPoints ?? null,
      sspGate: scoring.sspGate ?? false,
      placeholder: scoring.placeholder ?? false,
      outcome,
      deduction,
      poamEligible:
        outcome === 'not_met' && poamEligible(number, scoring, revision),
      objectives,
      objectivesMet: objectives.filter(
        (o) => o.outcome === 'met' || o.outcome === 'not_applicable',
      ).length,
      objectivesTotal: objectives.length,
      objectivesWithoutTask: objectives.filter((o) => o.outcome === 'no_task')
        .length,
    });
  }
  requirements.sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }),
  );

  const maxScore = requirements.length;
  const totalDeduction = requirements.reduce((sum, r) => sum + r.deduction, 0);
  const score = maxScore - totalDeduction;
  const notMet = requirements.filter((r) => r.outcome === 'not_met');
  const sspMet = !requirements.some(
    (r) => r.sspGate && r.outcome === 'not_met',
  );
  const fivePointNotMet = notMet.filter((r) => r.points === 5).length;
  const poamEligibleNotMet = notMet.filter((r) => r.poamEligible).length;

  let eligibility: Level2Eligibility;
  if (!sspMet) eligibility = 'not_assessable';
  else if (notMet.length === 0) eligibility = 'final';
  else if (
    maxScore > 0 &&
    score / maxScore >= CONDITIONAL_MIN_RATIO &&
    poamEligibleNotMet === notMet.length
  ) {
    eligibility = 'conditional';
  } else eligibility = 'fail';

  return {
    supported: true,
    revision,
    placeholderWeights: revision === 3,
    maxScore,
    score,
    totalDeduction,
    eligibility,
    sspMet,
    requirementsMet: requirements.filter((r) => r.outcome === 'met').length,
    requirementsNotMet: notMet.length,
    requirementsNotApplicable: requirements.filter(
      (r) => r.outcome === 'not_applicable',
    ).length,
    fivePointNotMet,
    poamEligibleNotMet,
    objectivesWithoutTask: requirements.reduce(
      (sum, r) => sum + r.objectivesWithoutTask,
      0,
    ),
    requirements,
  };
}
