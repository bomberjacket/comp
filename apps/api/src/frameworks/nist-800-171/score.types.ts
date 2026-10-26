export type ObjectiveOutcome = 'met' | 'not_met' | 'not_applicable' | 'no_task';

export type RequirementOutcome = 'met' | 'not_met' | 'not_applicable';

/**
 * Level 2 result the current evidence supports.
 * - final: every requirement met.
 * - conditional: score ≥ 80 % of max and every open item may sit on a POA&M.
 * - fail: an open item that cannot be on a POA&M (any 3- or 5-point requirement,
 *   or one of the excluded 1-point requirements), or score below 80 %.
 * - not_assessable: the System Security Plan requirement (3.12.4) is not met.
 */
export type Level2Eligibility =
  'final' | 'conditional' | 'fail' | 'not_assessable';

export interface ScoredObjective {
  requirementId: string;
  identifier: string;
  outcome: ObjectiveOutcome;
  taskId: string | null;
  taskStatus: string | null;
}

export interface ScoredRequirement {
  /** Bare requirement number: "3.1.1" (Rev 2) or "03.01.01" (Rev 3). */
  number: string;
  points: 1 | 3 | 5;
  /** Reduced deduction available under the rule's partial-credit condition. */
  partialPoints: 3 | null;
  sspGate: boolean;
  placeholder: boolean;
  outcome: RequirementOutcome;
  /** Points actually subtracted (0 when met, N/A, or the SSP gate). */
  deduction: number;
  poamEligible: boolean;
  objectives: ScoredObjective[];
  objectivesMet: number;
  objectivesTotal: number;
  objectivesWithoutTask: number;
}

export interface Nist800171Score {
  supported: true;
  revision: 2 | 3;
  /** Rev 3: weights carried from Rev 2 pending a DoD methodology. */
  placeholderWeights: boolean;
  maxScore: number;
  score: number;
  totalDeduction: number;
  eligibility: Level2Eligibility;
  sspMet: boolean;
  requirementsMet: number;
  requirementsNotMet: number;
  requirementsNotApplicable: number;
  /** Open 5-point requirements: each one alone rules out Conditional status. */
  fivePointNotMet: number;
  /** Open requirements that may be carried on a POA&M. */
  poamEligibleNotMet: number;
  objectivesWithoutTask: number;
  requirements: ScoredRequirement[];
}

export interface UnsupportedScore {
  supported: false;
  reason: string;
}

export type Nist800171ScoreResult = Nist800171Score | UnsupportedScore;
