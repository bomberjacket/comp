import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { runCommandCapture } from './shell';

export type GatekeeperState = 'enabled' | 'disabled';

/** `spctl --status` prints "assessments enabled" or "assessments disabled". */
export function parseGatekeeperStatus(output: string): GatekeeperState | null {
  const m = /assessments\s+(enabled|disabled)/i.exec(output);
  return m ? (m[1].toLowerCase() as GatekeeperState) : null;
}

/**
 * NIST SP 800-171 3.4.8: an application execution policy that denies
 * unauthorized software. Gatekeeper is macOS's enforcement of that policy
 * for downloaded applications: only identified developers and notarized
 * software run unless the user overrides it. `spctl` exits non-zero when
 * assessments are off while still printing the state, so stdout is kept.
 */
export class MacOSGatekeeperCheck implements ComplianceCheck {
  checkType = 'gatekeeper' as const;
  displayName = 'Gatekeeper';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'spctl --status';
    const result = runCommandCapture('spctl --status', 15000);
    const state = parseGatekeeperStatus(result.output);
    if (state === null) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method,
          raw: (result.output || result.error || '').substring(0, 500),
          message: 'Unable to read the Gatekeeper assessment state',
        },
        checkedAt,
      };
    }
    return {
      checkType: this.checkType,
      passed: state === 'enabled',
      details: {
        method,
        raw: JSON.stringify({ state, exitCode: result.exitCode, output: result.output }),
        message:
          state === 'enabled'
            ? 'Gatekeeper assessments are enabled: downloaded software must be signed and notarized'
            : 'Gatekeeper assessments are disabled: any downloaded software can run',
      },
      checkedAt,
    };
  }
}
