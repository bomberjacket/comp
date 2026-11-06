import type { Department, Frequency } from '../nist-800-171/types';

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

export type AnswerDomainMode = 'single' | 'it_ot';
/** How results are rolled up for the module; consumed by the answer layer later. */
export type ScoringModel = 'cpg' | 'mil' | 'tier' | 'standard';

/** One CSET module as the generator sees it (`inputs/cset-<key>.json` plus static facts). */
export interface ModuleDef {
  key: string;
  inputFile: string;
  kind: 'maturity' | 'standard';
  name: string;
  version: string;
  description: string;
  /** CSET answer options, e.g. `['Y', 'I', 'S', 'N']` */
  answerOptions: string[];
  domainMode: AnswerDomainMode;
  scoring: ScoringModel;
  defaultDepartment: Department;
  taskFrequency: Frequency;
  attribution: string;
}

// Shapes of the extractor's JSON (see extract/export.ts).
export interface ReferenceJson {
  title: string | null;
  shortName: string | null;
  docNum: string | null;
  section: string | null;
  page: string | number | null;
  destination: string | null;
}

export interface GroupingJson {
  id: number;
  title: string;
  description: string | null;
  parentId: number | null;
  sequence: number | null;
  groupLevel: number | null;
  abbreviation: string | null;
  titlePrefix: string | null;
}

export interface MaturityQuestionJson {
  id: number;
  title: string;
  text: string;
  supplemental: string | null;
  levelId: number | null;
  sequence: number | null;
  groupingId: number | null;
  parentQuestionId: number | null;
  type: string | null;
  shortName: string | null;
  examinationApproach: string | null;
  scope: string | null;
  securityPractice: string | null;
  outcome: string | null;
  recommendAction: string | null;
  riskAddressed: string | null;
  services: string | null;
  implementationGuides: string | null;
  props: Record<string, string>;
  options: Array<{ id: number; text: string; type: string | null; sequence: number | null }>;
  references: ReferenceJson[];
  referenceText: string[];
  subModels: string[];
}

export interface MaturityModuleJson {
  kind: 'maturity';
  source: string;
  modelId: number;
  modelName: string;
  title: string | null;
  answerOptions: string[];
  levels: Array<{ id: number; level: number; name: string }>;
  groupings: GroupingJson[];
  questions: MaturityQuestionJson[];
}

export interface RequirementJson {
  id: number;
  sequence: number | null;
  title: string;
  text: string;
  supplemental: string | null;
  category: string | null;
  subCategory: string | null;
  weight: string | number | null;
  implementationRecommendations: string | null;
  references: ReferenceJson[];
}

export interface StandardModuleJson {
  kind: 'standard';
  source: string;
  setName: string;
  fullName: string | null;
  shortName: string | null;
  requirements: RequirementJson[];
}

/** A requirement row plus the control and family it belongs to, before ids are assigned. */
export interface BuiltRequirement {
  identifier: string;
  name: string;
  description: string;
  /** family label as shown in the UI, e.g. `AM - Asset Management` */
  familyLabel: string;
  familyKey: string;
  controlKey: string;
  controlName: string;
  controlDescription: string;
  /** one-line summary used in the control's task */
  summary: string;
}

export interface ModuleBuild {
  module: ModuleDef;
  requirements: BuiltRequirement[];
  /** familyKey -> label, in document order */
  families: Map<string, string>;
}

export interface AnswerProfile {
  frameworkId: string;
  module: string;
  answerOptions: string[];
  domainMode: AnswerDomainMode;
  scoring: ScoringModel;
}
