/**
 * Shapes of CISA ScubaGear output (`ScubaResults_<uuid>.json`, ScubaGear 2.x)
 * and the compact form Comp AI stores on the connection.
 */

/** Product abbreviations used as keys in `Summary` and `Results`. */
export type ScubaProduct =
  | 'AAD'
  | 'EXO'
  | 'SharePoint'
  | 'Teams'
  | 'PowerPlatform'
  | 'PowerBI'
  | 'SecuritySuite';

export const SCUBA_PRODUCTS: Record<ScubaProduct, { service: string; name: string }> = {
  AAD: { service: 'aad', name: 'Entra ID' },
  EXO: { service: 'exo', name: 'Exchange Online' },
  SharePoint: { service: 'sharepoint', name: 'SharePoint Online and OneDrive' },
  Teams: { service: 'teams', name: 'Microsoft Teams' },
  PowerPlatform: { service: 'powerplatform', name: 'Power Platform' },
  PowerBI: { service: 'powerbi', name: 'Power BI' },
  SecuritySuite: { service: 'securitysuite', name: 'Security Suite (Defender for Office 365, Purview)' },
};

/** Result values ScubaGear writes per policy. */
export type ScubaResultValue = 'Pass' | 'Fail' | 'Warning' | 'N/A' | 'Error' | 'Omitted';

// ---------------------------------------------------------------------------
// Raw file (only the parts we read; `Raw` is the provider settings export)
// ---------------------------------------------------------------------------

export interface ScubaRawMetaData {
  TenantId?: string;
  DisplayName?: string;
  DomainName?: string;
  ProductSuite?: string;
  ProductsAssessed?: string[];
  ProductAbbreviationMapping?: Record<string, string>;
  Tool?: string;
  ToolVersion?: string;
  TimestampZulu?: string;
  ReportUUID?: string;
}

export interface ScubaRawSummary {
  Manual?: number;
  Failures?: number;
  Warnings?: number;
  Errors?: number;
  Passes?: number;
  Omits?: number;
  IncorrectResults?: number;
}

export interface ScubaRawControl {
  'Control ID': string;
  Requirement: string;
  Result: string;
  Criticality: string;
  Details?: string;
  OmittedEvaluationResult?: string;
  OmittedEvaluationDetails?: string;
  IncorrectResult?: string | boolean;
  IncorrectResultDetails?: string;
  OriginalResult?: string;
  OriginalDetails?: string;
  Comments?: unknown;
  ResolutionDate?: string | null;
}

export interface ScubaRawGroup {
  GroupName: string;
  GroupNumber: string;
  GroupReferenceURL?: string;
  Controls: ScubaRawControl[];
}

export interface ScubaRawResults {
  MetaData: ScubaRawMetaData;
  Summary?: Record<string, ScubaRawSummary>;
  Results: Record<string, ScubaRawGroup[]>;
  AnnotatedFailedPolicies?: Record<string, unknown>;
  Raw?: unknown;
}

// ---------------------------------------------------------------------------
// Compact form stored on the connection (credential field `scubaResults`)
// ---------------------------------------------------------------------------

export const SCUBA_COMPACT_FORMAT = 'comp-scuba/1';

export interface ScubaCompactMeta {
  tenantId: string;
  displayName: string;
  domainName: string;
  tool: string;
  toolVersion: string;
  /** ISO timestamp of the run (MetaData.TimestampZulu). */
  timestamp: string;
  reportId: string;
  productsAssessed: string[];
}

export interface ScubaCompactPolicy {
  /** Full policy id with version, e.g. `MS.AAD.1.1v1`. */
  id: string;
  /** Product abbreviation (`AAD`, `EXO`, ...). */
  product: string;
  groupNumber: string;
  groupName: string;
  /** Requirement text with ScubaGear's HTML indicators removed. */
  requirement: string;
  result: string;
  /** `Shall` or `Should`; `manual` is true when ScubaGear has no automated check. */
  criticality: 'Shall' | 'Should';
  manual: boolean;
  /** Marked as a CISA BOD 25-01 requirement in the baseline. */
  bod2501: boolean;
  details: string;
  omitted?: { result: string; details: string };
  incorrect?: { details: string; originalResult: string };
  comments: string[];
}

export interface ScubaCompactResults {
  format: typeof SCUBA_COMPACT_FORMAT;
  meta: ScubaCompactMeta;
  summary: Record<string, ScubaRawSummary>;
  policies: ScubaCompactPolicy[];
}

// ---------------------------------------------------------------------------
// Policy catalogue (generated from the baselines; see policies.generated.ts)
// ---------------------------------------------------------------------------

export interface ScubaPolicyDef {
  /** Full id with version, as it appears in the baseline (`MS.AAD.3.2v2`). */
  id: string;
  /** Id without the version suffix (`MS.AAD.3.2`); stable across wording bumps. */
  base: string;
  product: ScubaProduct;
  groupNumber: string;
  groupName: string;
  /** Baseline section link. */
  reference: string;
  requirement: string;
  criticality: 'Shall' | 'Should';
  /** False when ScubaGear cannot evaluate the policy (reported as N/A, manual). */
  automated: boolean;
  /** CISA Binding Operational Directive 25-01 requirement (federal agencies). */
  bod2501: boolean;
  /** NIST SP 800-53 r5 controls from CISA's own mapping file. */
  nist80053: string[];
}
