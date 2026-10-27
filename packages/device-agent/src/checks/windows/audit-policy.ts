import { execSync } from 'node:child_process';
import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { errorMessage, needsElevation } from './powershell';

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

/**
 * NIST SP 800-171 3.3.1 / 3.3.2: the device generates the audit records the
 * organization defined. Reads the effective advanced audit policy with
 * auditpol, which needs the agent to run elevated; without elevation the
 * check reports that honestly instead of guessing.
 */
export class WindowsAuditPolicyCheck implements ComplianceCheck {
  checkType = 'audit_policy' as const;
  displayName = 'Audit Policy';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const output = execSync('auditpol /get /category:* /r', {
        encoding: 'utf-8',
        timeout: 15000,
      });
      const settings = parseAuditpolCsv(output);
      if (settings.size === 0) {
        return {
          checkType: this.checkType,
          passed: false,
          details: {
            method: 'auditpol /get /category:* /r',
            raw: output.substring(0, 500),
            message: 'auditpol returned no policy rows; the audit policy could not be read',
          },
          checkedAt,
        };
      }
      const result = evaluateAuditPolicy(settings);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method: 'auditpol /get /category:* /r',
          raw: JSON.stringify({
            satisfied: result.satisfied,
            missing: result.missing,
          }).substring(0, 1800),
          message: result.message,
        },
        checkedAt,
      };
    } catch (error) {
      const msg = errorMessage(error);
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method: 'auditpol /get /category:* /r',
          raw: msg.substring(0, 500),
          message: needsElevation(msg)
            ? 'Audit policy could not be read: auditpol needs the agent to run as Administrator. Attach the GPO or Intune audit baseline as evidence, or run the agent elevated.'
            : 'Unable to read the audit policy',
        },
        checkedAt,
      };
    }
  }
}
