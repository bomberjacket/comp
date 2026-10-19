/** Raw element from a NIST CPRT JSON export (`response.elements.elements[]`). */
export interface CprtElement {
  element_type: string;
  element_identifier: string;
  title: string;
  text: string;
  doc_identifier: string;
}

/** Raw relationship from a NIST CPRT JSON export (`response.elements.relationships[]`). */
export interface CprtRelationship {
  source_element_identifier: string;
  dest_element_identifier: string;
  relationship_identifier: string;
}

/** Indexed view of one CPRT document. */
export interface CprtDoc {
  docId: string;
  elements: CprtElement[];
  byType: Map<string, CprtElement[]>;
  byId: Map<string, CprtElement>;
  /** projection edges: source -> dest[] */
  projFrom: Map<string, string[]>;
  /** projection edges: dest -> source[] */
  projTo: Map<string, string[]>;
  /** non-projection edges grouped by relationship type: type -> source -> dest[] */
  relsByType: Map<string, Map<string, string[]>>;
}

export type Frequency = 'monthly' | 'quarterly' | 'yearly';
export type Department = 'none' | 'admin' | 'gov' | 'hr' | 'it' | 'itsm' | 'qms';
export type Revision = 'r2' | 'r3';

export interface FamilyDef {
  /** Rev 3 family identifier, e.g. 03.01 */
  r3: string;
  /** Rev 2 family identifier, e.g. 3.1 (null for families new in Rev 3) */
  r2: string | null;
  /** Two-letter family code shared with SP 800-53 */
  code: string;
  /** Rev 3 family title */
  name: string;
  department: Department;
}

export interface FamilyRow {
  id: string;
  name: string;
  description: string;
  status: 'visible' | 'hidden' | 'under_construction' | 'partial';
}

export interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  description: string;
  visible: boolean;
  familyId: string;
}

export interface RequirementRow {
  id: string;
  frameworkId: string;
  name: string;
  identifier: string;
  description: string;
  requirementFamily: string;
  sortOrder: number;
}

export interface ControlRow {
  id: string;
  name: string;
  description: string;
  controlFamily: string;
}

export interface PolicyRow {
  id: string;
  name: string;
  description: string;
  frequency: Frequency;
  department: Department;
  content: unknown;
}

export interface TaskRow {
  id: string;
  name: string;
  description: string;
  frequency: Frequency;
  department: Department;
  automationStatus: 'AUTOMATED' | 'MANUAL';
}

export interface PolicyLinkRow {
  id: string;
  frameworkId: string;
  controlTemplateId: string;
  policyTemplateId: string;
}

export interface TaskLinkRow {
  id: string;
  frameworkId: string;
  controlTemplateId: string;
  taskTemplateId: string;
}

/** Implicit many-to-many join row as used by the seed `relations/` files. */
export interface Pair {
  A: string;
  B: string;
}

/** One Rev 2 security requirement (3.x.y) as read from the SP 800-171A workbook. */
export interface Rev2Requirement {
  id: string;
  familyName: string;
  sortAs: string;
  text: string;
  examine: string;
  interview: string;
  test: string;
}

/** One Rev 2 assessment objective (3.x.y[a]). */
export interface Rev2Objective {
  identifier: string;
  requirementId: string;
  text: string;
  /** true when the requirement has a single objective carried on its header row */
  solo: boolean;
  seq: number;
}

export type DispositionKind = 'carried' | 'incorporated' | 'addressed_by' | 'withdrawn';

/** Rev 2 -> Rev 3 disposition of one Rev 2 requirement, derived from the CPRT Rev 3 export. */
export interface Disposition {
  r2Id: string;
  /** zero-padded Rev 3 slot, e.g. 03.01.14 */
  slot: string;
  kind: DispositionKind;
  /** Rev 3 slots that incorporate or address this requirement */
  targets: string[];
  reason: string;
}

/** One row of NIST's "Change Analysis 800-171 R2-R3" sheet. */
export interface ChangeRow {
  r2Id: string;
  r3Id: string;
  name: string;
  flags: string[];
  summary: string;
}

export interface FrequencyRow {
  objectiveId: string;
  frequency: string;
  rationale: string;
}

/** One active Rev 3 security requirement slot (03.xx.yy) with everything hanging off it. */
export interface Rev3Requirement {
  slot: string;
  title: string;
  familyR3: string;
  /** flattened requirement text: one entry per sub-part, document order */
  parts: Array<{ label: string; text: string }>;
  discussion: string;
  examine: string;
  interview: string;
  test: string;
  odps: Array<{ identifier: string; title: string; text: string; statement: string }>;
  determinations: Array<{ identifier: string; text: string; partLabel: string }>;
}

export interface GeneratedData {
  families: FamilyRow[];
  frameworks: FrameworkRow[];
  requirements: RequirementRow[];
  controls: ControlRow[];
  policies: PolicyRow[];
  tasks: TaskRow[];
  policyLinks: PolicyLinkRow[];
  taskLinks: TaskLinkRow[];
  controlRequirementPairs: Pair[];
  controlPolicyPairs: Pair[];
  controlTaskPairs: Pair[];
}
