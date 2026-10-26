/** Mirrors apps/api/src/frameworks/nist-800-171/score.types.ts. */

export type ObjectiveOutcome = 'met' | 'not_met' | 'not_applicable' | 'no_task';

export type RequirementOutcome = 'met' | 'not_met' | 'not_applicable';

export type Level2Eligibility = 'final' | 'conditional' | 'fail' | 'not_assessable';

export interface ScoredObjective {
  requirementId: string;
  identifier: string;
  outcome: ObjectiveOutcome;
  taskId: string | null;
  taskStatus: string | null;
}

export interface ScoredRequirement {
  number: string;
  points: 1 | 3 | 5;
  partialPoints: 3 | null;
  sspGate: boolean;
  placeholder: boolean;
  outcome: RequirementOutcome;
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
  placeholderWeights: boolean;
  maxScore: number;
  score: number;
  totalDeduction: number;
  eligibility: Level2Eligibility;
  sspMet: boolean;
  requirementsMet: number;
  requirementsNotMet: number;
  requirementsNotApplicable: number;
  fivePointNotMet: number;
  poamEligibleNotMet: number;
  objectivesWithoutTask: number;
  requirements: ScoredRequirement[];
}

export interface UnsupportedScore {
  supported: false;
  reason: string;
}

export type Nist800171ScoreResult = Nist800171Score | UnsupportedScore;
