import type { CheckResult } from '../../shared/types';
import { runCommandCapture } from '../shell';
import type { ComplianceCheck } from '../types';
import { readText } from './files';

const FIPS_FLAG = '/proc/sys/crypto/fips_enabled';

export function parseFipsFlag(text: string | null): boolean | null {
  if (text === null) return null;
  const v = text.trim();
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

/**
 * NIST SP 800-171 3.13.11: FIPS-validated cryptography. The kernel flag is
 * the single source of truth on Linux: when it is 1 the kernel crypto API,
 * OpenSSL, GnuTLS and NSS all run in their FIPS modes (RHEL, Ubuntu Pro,
 * SLES). `fips-mode-setup --check` adds the distribution's own verdict.
 */
export class LinuxFipsModeCheck implements ComplianceCheck {
  checkType = 'fips_mode' as const;
  displayName = 'FIPS Mode';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = `${FIPS_FLAG}, fips-mode-setup --check`;
    const flag = readText(FIPS_FLAG);
    const enabled = parseFipsFlag(flag.text);
    const setup = runCommandCapture('fips-mode-setup --check 2>/dev/null', 15000).output;
    const message =
      enabled === true
        ? 'Kernel FIPS mode is enabled (fips_enabled = 1)'
        : enabled === false
          ? 'Kernel FIPS mode is disabled (fips_enabled = 0)'
          : flag.error
            ? 'Unable to read the kernel FIPS flag'
            : 'Kernel FIPS flag is absent: this kernel was built without FIPS support; treated as disabled';
    return {
      checkType: this.checkType,
      passed: enabled === true,
      details: {
        method,
        raw: JSON.stringify({
          fipsEnabled: flag.text?.trim() ?? null,
          fipsModeSetup: setup || null,
          error: flag.error,
        }),
        message: setup ? `${message}; ${setup.split(/\r?\n/)[0]}` : message,
      },
      checkedAt,
    };
  }
}
