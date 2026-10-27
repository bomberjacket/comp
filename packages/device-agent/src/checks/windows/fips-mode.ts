import { execSync } from 'node:child_process';
import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';

const FIPS_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\FipsAlgorithmPolicy';

/**
 * Parse the `Enabled` value of the FIPS algorithm policy. Windows stores it as
 * REG_DWORD 1 (on) or 0 (off); an empty read means the value is absent.
 */
export function parseFipsEnabled(output: string): boolean | null {
  const trimmed = output.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  return n === 1;
}

/**
 * NIST SP 800-171 3.13.11: FIPS-validated cryptography protects CUI.
 * Reads the "System cryptography: Use FIPS compliant algorithms for
 * encryption, hashing, and signing" security policy, which forces Windows
 * crypto providers (BitLocker, TLS, EFS, RDP) into their FIPS-validated modes.
 * Evidence only: a failure does not change the device's compliance verdict.
 */
export class WindowsFipsModeCheck implements ComplianceCheck {
  checkType = 'fips_mode' as const;
  displayName = 'FIPS Mode';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const output = execSync(
        `powershell.exe -NoProfile -NonInteractive -Command "(Get-ItemProperty -Path '${FIPS_KEY}' -Name Enabled -ErrorAction Stop).Enabled"`,
        { encoding: 'utf-8', timeout: 15000 },
      );
      const enabled = parseFipsEnabled(output);
      return {
        checkType: this.checkType,
        passed: enabled === true,
        details: {
          method: 'Registry FipsAlgorithmPolicy\\Enabled',
          raw: output.trim().substring(0, 200),
          message:
            enabled === true
              ? 'System cryptography: Use FIPS compliant algorithms is enabled'
              : enabled === false
                ? 'System cryptography: Use FIPS compliant algorithms is disabled'
                : 'FIPS algorithm policy value is not set; treated as disabled',
        },
        checkedAt,
      };
    } catch (error) {
      // Get-ItemProperty throws when the key or value does not exist, which is
      // the normal state on a machine where the policy was never configured.
      const errorMessage = error instanceof Error ? error.message : String(error);
      const missing = /cannot find|does not exist|not exist/i.test(errorMessage);
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method: 'Registry FipsAlgorithmPolicy\\Enabled',
          raw: errorMessage.substring(0, 500),
          message: missing
            ? 'FIPS algorithm policy is not configured (registry value missing); treated as disabled'
            : 'Unable to read the FIPS algorithm policy',
        },
        checkedAt,
      };
    }
  }
}
