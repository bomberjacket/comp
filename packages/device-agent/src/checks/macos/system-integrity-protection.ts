import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { errorMessage, runCommand } from './shell';

export type SipState = 'enabled' | 'disabled' | 'custom';

/**
 * `csrutil status` prints "System Integrity Protection status: enabled." or
 * "disabled.", or "unknown (Custom Configuration)." followed by one line per
 * protection when the configuration was changed from Recovery.
 */
export function parseSipStatus(
  output: string,
): { state: SipState; disabledParts: string[] } | null {
  const m = /System Integrity Protection status:\s*(enabled|disabled|unknown)/i.exec(output);
  if (!m) return null;
  const word = m[1].toLowerCase();
  if (word === 'enabled') return { state: 'enabled', disabledParts: [] };
  if (word === 'disabled') return { state: 'disabled', disabledParts: [] };
  const disabledParts: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const part = /^\s*([A-Za-z ]+?):\s*disabled/i.exec(line);
    if (part) disabledParts.push(part[1].trim());
  }
  return { state: 'custom', disabledParts };
}

/**
 * NIST SP 800-171 3.4.5: logical access restrictions associated with changes
 * to the system. System Integrity Protection keeps the operating system's
 * files, processes and kernel extensions read-only even to root, so a
 * compromised administrator account cannot alter the system baseline.
 */
export class MacOSSystemIntegrityProtectionCheck implements ComplianceCheck {
  checkType = 'system_integrity_protection' as const;
  displayName = 'System Integrity Protection';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'csrutil status';
    try {
      const output = runCommand('csrutil status', 15000);
      const parsed = parseSipStatus(output);
      if (!parsed) {
        return {
          checkType: this.checkType,
          passed: false,
          details: {
            method,
            raw: output.substring(0, 500),
            message: 'Unable to read the System Integrity Protection state',
          },
          checkedAt,
        };
      }
      const message =
        parsed.state === 'enabled'
          ? 'System Integrity Protection is enabled'
          : parsed.state === 'disabled'
            ? 'System Integrity Protection is disabled'
            : `System Integrity Protection is partially disabled (custom configuration): ${
                parsed.disabledParts.join(', ') || 'see raw output'
              }`;
      return {
        checkType: this.checkType,
        passed: parsed.state === 'enabled',
        details: {
          method,
          raw: JSON.stringify({ ...parsed, output: output.substring(0, 1500) }),
          message,
        },
        checkedAt,
      };
    } catch (error) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method,
          raw: errorMessage(error).substring(0, 500),
          message: 'Unable to run csrutil to read the System Integrity Protection state',
        },
        checkedAt,
      };
    }
  }
}
