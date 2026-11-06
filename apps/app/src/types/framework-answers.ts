/** Shapes returned by /v1/framework-answers (apps/api/src/requirement-answers). */
export type AnswerDomain = 'all' | 'it' | 'ot';
export type AnswerValue = 'yes' | 'incomplete' | 'scoped' | 'no' | 'not_applicable' | 'alternate';
export type AnswerDomainMode = 'single' | 'it_ot';
export type AnswerScoringModel = 'cpg' | 'mil' | 'tier' | 'standard';

export interface AnswerProfile {
  answerOptions: string[];
  answerValues: AnswerValue[];
  domainMode: AnswerDomainMode;
  scoring: AnswerScoringModel;
}

export interface RequirementAnswerRow {
  id: string;
  requirementId: string | null;
  domain: AnswerDomain;
  answer: AnswerValue;
  justification: string | null;
  comment: string | null;
  markForReview: boolean;
  answeredAt: string;
  answeredBy: { user: { name: string | null; email: string } | null } | null;
}

export interface FrameworkAnswers {
  profile: AnswerProfile;
  domains: AnswerDomain[];
  chosenDomains: AnswerDomain[];
  answers: RequirementAnswerRow[];
}

export type AnswerCounts = Record<AnswerValue | 'unanswered', number>;

export interface AnswerGroupResult {
  key: string;
  label: string;
  domain: AnswerDomain;
  counts: AnswerCounts;
  total: number;
  percent: number;
  achieved: boolean;
}

export interface FrameworkAnswerResults {
  domains: AnswerDomain[];
  totals: AnswerGroupResult[];
  families: AnswerGroupResult[];
  controls: AnswerGroupResult[];
  answered: number;
  expected: number;
}

export const ANSWER_LABELS: Record<AnswerValue, { label: string; short: string }> = {
  yes: { label: 'Yes', short: 'Y' },
  incomplete: { label: 'Incomplete', short: 'I' },
  scoped: { label: 'Scoped', short: 'S' },
  no: { label: 'No', short: 'N' },
  not_applicable: { label: 'Not applicable', short: 'NA' },
  alternate: { label: 'Alternate', short: 'A' },
};

export const DOMAIN_LABELS: Record<AnswerDomain, string> = { all: 'Answer', it: 'IT', ot: 'OT' };

export const NEEDS_JUSTIFICATION: ReadonlySet<AnswerValue> = new Set(['not_applicable', 'alternate']);
