import { log } from '../main/logger';
import type { CheckResult } from '../shared/types';
import { clampDetails } from './clamp';
import type { ComplianceCheck } from './types';

// macOS checks
import { MacOSAntivirusCheck } from './macos/antivirus';
import { MacOSDiskEncryptionCheck } from './macos/disk-encryption';
import { MacOSPasswordPolicyCheck } from './macos/password-policy';
import { MacOSScreenLockCheck } from './macos/screen-lock';

// Linux checks
import { LinuxAntivirusCheck } from './linux/antivirus';
import { LinuxDiskEncryptionCheck } from './linux/disk-encryption';
import { LinuxPasswordPolicyCheck } from './linux/password-policy';
import { LinuxScreenLockCheck } from './linux/screen-lock';

// Windows checks
import { WindowsAntivirusCheck } from './windows/antivirus';
import { WindowsAuditPolicyCheck } from './windows/audit-policy';
import { WindowsDefenderTamperProtectionCheck } from './windows/defender-tamper';
import { WindowsDiskEncryptionCheck } from './windows/disk-encryption';
import { WindowsFipsModeCheck } from './windows/fips-mode';
import { WindowsLocalAdminsCheck } from './windows/local-admins';
import { WindowsLogForwardingCheck } from './windows/log-forwarding';
import { WindowsPasswordPolicyCheck } from './windows/password-policy';
import { WindowsRemovableStorageCheck } from './windows/removable-storage';
import { WindowsScreenLockCheck } from './windows/screen-lock';
import { WindowsSmb1Check } from './windows/smb1';
import { WindowsUpdateCheck } from './windows/windows-update';

/**
 * Returns the appropriate compliance checks for the current platform.
 */
function getChecksForPlatform(): ComplianceCheck[] {
  const platform = process.platform;

  if (platform === 'darwin') {
    return [
      new MacOSDiskEncryptionCheck(),
      new MacOSAntivirusCheck(),
      new MacOSPasswordPolicyCheck(),
      new MacOSScreenLockCheck(),
    ];
  }

  if (platform === 'linux') {
    return [
      new LinuxDiskEncryptionCheck(),
      new LinuxAntivirusCheck(),
      new LinuxPasswordPolicyCheck(),
      new LinuxScreenLockCheck(),
    ];
  }

  if (platform === 'win32') {
    return [
      new WindowsDiskEncryptionCheck(),
      new WindowsAntivirusCheck(),
      new WindowsPasswordPolicyCheck(),
      new WindowsScreenLockCheck(),
      // Evidence checks (NIST SP 800-171); not part of the compliance verdict.
      new WindowsFipsModeCheck(),
      new WindowsLogForwardingCheck(),
      new WindowsAuditPolicyCheck(),
      new WindowsRemovableStorageCheck(),
      new WindowsSmb1Check(),
      new WindowsDefenderTamperProtectionCheck(),
      new WindowsUpdateCheck(),
      new WindowsLocalAdminsCheck(),
    ];
  }

  log(`Unsupported platform: ${platform}`, 'WARN');
  return [];
}

/**
 * Runs all compliance checks for the current platform.
 * Returns an array of check results.
 */
export async function runAllChecks(): Promise<CheckResult[]> {
  const checks = getChecksForPlatform();
  const results: CheckResult[] = [];

  for (const check of checks) {
    try {
      log(`Running check: ${check.displayName}`);
      const result = clampDetails(await check.run());
      results.push(result);
      log(`  ${check.displayName}: ${result.passed ? 'PASS' : 'FAIL'} - ${result.details.message}`);
    } catch (error) {
      log(`Check failed: ${check.displayName} - ${error}`, 'ERROR');
      results.push({
        checkType: check.checkType,
        passed: false,
        details: {
          method: 'error',
          raw: error instanceof Error ? error.message : String(error),
          message: `Check failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        checkedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
