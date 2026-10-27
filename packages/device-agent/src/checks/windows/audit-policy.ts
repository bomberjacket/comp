import { execSync } from 'node:child_process';
import { askHelper } from '../../helper/client';
import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import {
  asArray,
  errorMessage,
  needsElevation,
  parseJsonObject,
  runPowerShellScript,
} from './powershell';

type Need = 'success' | 'failure' | 'both';

/**
 * Advanced audit policy subcategories a CUI endpoint must log (DISA STIG and
 * the CMMC assessment guide for 3.3.1 / 3.3.2 agree on this core).
 */
export const REQUIRED_AUDIT: Array<{ subcategory: string; need: Need }> = [
  { subcategory: 'Credential Validation', need: 'both' },
  { subcategory: 'Logon', need: 'both' },
  { subcategory: 'Logoff', need: 'success' },
  { subcategory: 'Account Lockout', need: 'failure' },
  { subcategory: 'Special Logon', need: 'success' },
  { subcategory: 'User Account Management', need: 'both' },
  { subcategory: 'Security Group Management', need: 'both' },
  { subcategory: 'Audit Policy Change', need: 'both' },
  { subcategory: 'Authentication Policy Change', need: 'success' },
  { subcategory: 'Sensitive Privilege Use', need: 'both' },
  { subcategory: 'Process Creation', need: 'success' },
  { subcategory: 'Security State Change', need: 'success' },
  { subcategory: 'Security System Extension', need: 'success' },
  { subcategory: 'Removable Storage', need: 'both' },
];

/** `auditpol /get /category:* /r` → subcategory → inclusion setting. */
export function parseAuditpolCsv(csv: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return out;
  const header = lines[0].split(',').map((h) => h.trim());
  const subIdx = header.indexOf('Subcategory');
  const incIdx = header.indexOf('Inclusion Setting');
  if (subIdx < 0 || incIdx < 0) return out;
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const sub = cells[subIdx]?.trim();
    if (sub) out.set(sub, (cells[incIdx] ?? '').trim());
  }
  return out;
}

function satisfies(setting: string, need: Need): boolean {
  const s = setting.toLowerCase();
  const success = s.includes('success');
  const failure = s.includes('failure');
  if (need === 'both') return success && failure;
  if (need === 'success') return success;
  return failure;
}

export function evaluateAuditPolicy(settings: Map<string, string>): {
  passed: boolean;
  satisfied: string[];
  missing: Array<{ subcategory: string; need: Need; current: string }>;
  message: string;
} {
  const satisfied: string[] = [];
  const missing: Array<{ subcategory: string; need: Need; current: string }> = [];
  for (const req of REQUIRED_AUDIT) {
    const current = settings.get(req.subcategory) ?? 'No Auditing';
    if (satisfies(current, req.need)) satisfied.push(req.subcategory);
    else missing.push({ ...req, current });
  }
  const passed = missing.length === 0;
  return {
    passed,
    satisfied,
    missing,
    message: passed
      ? `Audit policy covers all ${REQUIRED_AUDIT.length} required subcategories`
      : `Audit policy covers ${satisfied.length} of ${REQUIRED_AUDIT.length} required subcategories; missing: ${missing
          .map((m) => `${m.subcategory} (${m.current})`)
          .join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Configured-policy fallbacks. The effective policy (auditpol) needs
// administrator rights. When neither the helper nor elevation is available,
// the policy an MDM or Group Policy *configured* is still readable by any user:
// Intune's Audit CSP lands in the PolicyManager registry area, and Group
// Policy keeps audit.csv files under System32\GroupPolicy. Both are evidence
// of intent, not proof of effect, and the findings say so.
// ---------------------------------------------------------------------------

/** Intune Policy CSP Audit settings → auditpol subcategory names. */
export const INTUNE_AUDIT_SETTINGS: Record<string, string> = {
  AccountLogon_AuditCredentialValidation: 'Credential Validation',
  AccountLogon_AuditKerberosAuthenticationService: 'Kerberos Authentication Service',
  AccountLogon_AuditKerberosServiceTicketOperations: 'Kerberos Service Ticket Operations',
  AccountLogon_AuditOtherAccountLogonEvents: 'Other Account Logon Events',
  AccountLogonLogoff_AuditAccountLockout: 'Account Lockout',
  AccountLogonLogoff_AuditGroupMembership: 'Group Membership',
  AccountLogonLogoff_AuditLogoff: 'Logoff',
  AccountLogonLogoff_AuditLogon: 'Logon',
  AccountLogonLogoff_AuditOtherLogonLogoffEvents: 'Other Logon/Logoff Events',
  AccountLogonLogoff_AuditSpecialLogon: 'Special Logon',
  AccountLogonLogoff_AuditUserDeviceClaims: 'User / Device Claims',
  AccountManagement_AuditApplicationGroupManagement: 'Application Group Management',
  AccountManagement_AuditComputerAccountManagement: 'Computer Account Management',
  AccountManagement_AuditDistributionGroupManagement: 'Distribution Group Management',
  AccountManagement_AuditOtherAccountManagementEvents: 'Other Account Management Events',
  AccountManagement_AuditSecurityGroupManagement: 'Security Group Management',
  AccountManagement_AuditUserAccountManagement: 'User Account Management',
  DetailedTracking_AuditDPAPIActivity: 'DPAPI Activity',
  DetailedTracking_AuditPNPActivity: 'Plug and Play Events',
  DetailedTracking_AuditProcessCreation: 'Process Creation',
  DetailedTracking_AuditProcessTermination: 'Process Termination',
  DetailedTracking_AuditRPCEvents: 'RPC Events',
  DetailedTracking_AuditTokenRightAdjusted: 'Token Right Adjusted Events',
  ObjectAccess_AuditFileShare: 'File Share',
  ObjectAccess_AuditFileSystem: 'File System',
  ObjectAccess_AuditOtherObjectAccessEvents: 'Other Object Access Events',
  ObjectAccess_AuditRemovableStorage: 'Removable Storage',
  PolicyChange_AuditAuditPolicyChange: 'Audit Policy Change',
  PolicyChange_AuditAuthenticationPolicyChange: 'Authentication Policy Change',
  PolicyChange_AuditAuthorizationPolicyChange: 'Authorization Policy Change',
  PolicyChange_AuditMPSSVCRuleLevelPolicyChange: 'MPSSVC Rule-Level Policy Change',
  PolicyChange_AuditOtherPolicyChangeEvents: 'Other Policy Change Events',
  PrivilegeUse_AuditNonSensitivePrivilegeUse: 'Non Sensitive Privilege Use',
  PrivilegeUse_AuditSensitivePrivilegeUse: 'Sensitive Privilege Use',
  System_AuditIPsecDriver: 'IPsec Driver',
  System_AuditOtherSystemEvents: 'Other System Events',
  System_AuditSecurityStateChange: 'Security State Change',
  System_AuditSecuritySystemExtension: 'Security System Extension',
  System_AuditSystemIntegrity: 'System Integrity',
};

/** Audit CSP values: 0 off, 1 success, 2 failure, 3 both. */
export function settingFromCspValue(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  return ['No Auditing', 'Success', 'Failure', 'Success and Failure'][n] ?? null;
}

export function settingsFromIntune(
  values: Record<string, unknown> | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of Object.entries(values ?? {})) {
    const subcategory = INTUNE_AUDIT_SETTINGS[name];
    const setting = settingFromCspValue(value);
    if (subcategory && setting) out.set(subcategory, setting);
  }
  return out;
}

/** Merge every Group Policy audit.csv (same columns as auditpol /r plus a numeric Setting Value). */
export function settingsFromGpo(csvFiles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const csv of csvFiles) for (const [k, v] of parseAuditpolCsv(csv)) out.set(k, v);
  return out;
}

export interface ConfiguredAuditSnapshot {
  intune?: Record<string, unknown> | null;
  gpo?: string | string[] | null;
}

const FALLBACK_SCRIPT = `
$r = @{}
$k = 'HKLM:\\SOFTWARE\\Microsoft\\PolicyManager\\current\\device\\Audit'
if (Test-Path $k) {
  $p = Get-ItemProperty -Path $k
  $r.intune = @{}
  foreach ($n in $p.PSObject.Properties.Name) { if ($n -notmatch '^PS' -and $n -notmatch '_(ProviderSet|WinningProvider|LastWrite)$') { $r.intune[$n] = $p.$n } }
}
$files = @("$env:SystemRoot\\System32\\GroupPolicy\\Machine\\Microsoft\\Windows NT\\Audit\\audit.csv")
$files += @(Get-ChildItem -Path "$env:SystemRoot\\System32\\GroupPolicy\\DataStore" -Recurse -Filter audit.csv -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$r.gpo = @()
foreach ($f in $files) { if (Test-Path -LiteralPath $f) { try { $r.gpo += (Get-Content -LiteralPath $f -Raw -ErrorAction Stop) } catch {} } }
$r | ConvertTo-Json -Depth 4 -Compress
`;

/** Where the audit policy came from. */
export type AuditSource =
  | { kind: 'helper' | 'direct'; output: string }
  | { kind: 'intune' | 'gpo'; settings: Map<string, string> }
  | { kind: 'error'; message: string; helperError: string | null; fallbackNote: string };

/**
 * Effective policy first (helper as SYSTEM, then auditpol in this process when
 * elevated); then the configured policy from Intune or Group Policy; then an
 * honest error.
 */
export async function readAuditPolicy(
  runDirect: () => string = () =>
    execSync('auditpol /get /category:* /r', { encoding: 'utf-8', timeout: 15000 }),
  runFallback: () => string = () => runPowerShellScript(FALLBACK_SCRIPT, 30000),
): Promise<AuditSource> {
  const helper = await askHelper('auditpol');
  if (helper?.ok && helper.output) return { kind: 'helper', output: helper.output };
  let directError: string;
  try {
    return { kind: 'direct', output: runDirect() };
  } catch (error) {
    directError = errorMessage(error);
  }
  let fallbackNote = 'No Intune or Group Policy audit configuration was found on this device.';
  try {
    const snapshot = parseJsonObject<ConfiguredAuditSnapshot>(runFallback());
    const intune = settingsFromIntune(snapshot.intune);
    if (intune.size > 0) return { kind: 'intune', settings: intune };
    const gpo = settingsFromGpo(asArray(snapshot.gpo).filter((c) => typeof c === 'string'));
    if (gpo.size > 0) return { kind: 'gpo', settings: gpo };
  } catch (error) {
    fallbackNote = `The configured-policy fallback failed: ${errorMessage(error).substring(0, 200)}.`;
  }
  return {
    kind: 'error',
    message: directError,
    helperError: helper?.error ?? null,
    fallbackNote,
  };
}

const METHOD: Record<Exclude<AuditSource['kind'], 'error'>, string> = {
  helper: 'auditpol /get /category:* /r (via helper)',
  direct: 'auditpol /get /category:* /r',
  intune: 'Intune Audit CSP (PolicyManager) - configured policy, not effective',
  gpo: 'Group Policy audit.csv - configured policy, not effective',
};

/**
 * NIST SP 800-171 3.3.1 / 3.3.2: the device generates the audit records the
 * organization defined. Effective policy through the privileged helper (or
 * elevation); configured policy from Intune or Group Policy as a labelled
 * fallback; otherwise an honest "could not read".
 */
export class WindowsAuditPolicyCheck implements ComplianceCheck {
  checkType = 'audit_policy' as const;
  displayName = 'Audit Policy';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const source = await readAuditPolicy();
    if (source.kind === 'error') {
      const viaHelper = source.helperError ? ` Helper reported: ${source.helperError}.` : '';
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method: METHOD.direct,
          raw: source.message.substring(0, 500),
          message: needsElevation(source.message)
            ? `Audit policy could not be read: auditpol needs administrator rights and ${source.fallbackNote} Install the privileged helper (runs as SYSTEM), or configure the audit baseline through Intune or Group Policy.${viaHelper}`
            : `Unable to read the audit policy. ${source.fallbackNote}${viaHelper}`,
        },
        checkedAt,
      };
    }

    const method = METHOD[source.kind];
    const settings = 'settings' in source ? source.settings : parseAuditpolCsv(source.output);
    if (settings.size === 0) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method,
          raw: 'output' in source ? source.output.substring(0, 500) : '',
          message: 'auditpol returned no policy rows; the audit policy could not be read',
        },
        checkedAt,
      };
    }
    const result = evaluateAuditPolicy(settings);
    const configuredNote =
      source.kind === 'intune'
        ? 'Configured by Intune (effective policy needs the helper or elevation): '
        : source.kind === 'gpo'
          ? 'Configured by Group Policy (effective policy needs the helper or elevation): '
          : '';
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({
          source: source.kind,
          satisfied: result.satisfied,
          missing: result.missing,
        }).substring(0, 1800),
        message: `${configuredNote}${result.message}`,
      },
      checkedAt,
    };
  }
}
