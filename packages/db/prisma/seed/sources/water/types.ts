export type {
  ControlRow,
  Department,
  FamilyRow,
  Frequency,
  FrameworkRow,
  GeneratedData,
  Pair,
  PolicyLinkRow,
  PolicyRow,
  RequirementRow,
  TaskLinkRow,
  TaskRow,
} from '../nist-800-171/types';
export type { AnswerProfile } from '../cset/types';

/** inputs/wcat-3.1.json (extract/xlsx-to-json.py) */
export interface WcatJson {
  source: string;
  answerOptions: string[];
  items: WcatItem[];
}

export interface WcatItem {
  /** `1.A` … `5.A`, the CPG 1.0.1 practice number EPA reuses */
  id: string;
  function: string;
  functionNumber: number;
  question: string;
  epaPriority: boolean;
  recommendation: string;
  factsheetUrl: string;
}

/** inputs/cpg-1.0.1-components.json */
export interface CpgPractice {
  id: string;
  function: string;
  securityPractice: string;
  outcome: string;
  riskAddressed: string;
  scope: string;
  recommendedAction: string;
  csfReference: string;
  externalReferences: string;
  cost: string;
  impact: string;
  complexity: string;
}

/** inputs/wcat-to-cpg2.csv */
export interface CrosswalkRow {
  wcatId: string;
  cpg2Goal: string;
  secondaryGoals: string[];
  note: string;
}

/** inputs/interview-questions.csv */
export interface InterviewQuestion {
  cpg2Goal: string;
  section: string;
  question: string;
}

/** CPG 2.0 goal facts read from the CSET input (`../cset/inputs/cset-cpg2.json`). */
export interface Cpg2Goal {
  id: string;
  function: string;
  practice: string;
}
