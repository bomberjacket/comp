import { execSync } from 'node:child_process';
import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { errorMessage } from './powershell';

export interface DefenderStatus {
  IsTamperProtected?: boolean | null;
  TamperProtectionSource?: string | number | null;
  AMRunningMode?: string | null;
  RealTimeProtectionEnabled?: boolean | null;
  AntivirusEnabled?: boolean | null;
}

const SOURCE_LABEL: Record<string, string> = {
  '0': 'unknown',
  '1': 'signatures',
  '2': 'Intune',
  '3': 'E3',
  '4': 'E5',
  '5': 'Defender portal',
  '6': 'UI',
};

export function evaluateTamperProtection(s: DefenderStatus): { passed: boolean; message: string } {
  if (s.AntivirusEnabled === false || (s.AMRunningMode ?? '').toLowerCase().includes('passive')) {
    return {
      passed: false,
      message: `Defender Antivirus is ${s.AMRunningMode ?? 'not the active antivirus'}; tamper protection does not apply to a third-party antivirus`,
    };
  }
  if (s.IsTamperProtected === true) {
    const src = s.TamperProtectionSource;
    const label =
      src === null || src === undefined ? null : (SOURCE_LABEL[String(src)] ?? String(src));
    return {
      passed: true,
      message: `Defender tamper protection is on${label ? ` (managed by ${label})` : ''}`,
    };
  }
  return {
    passed: false,
    message: 'Defender tamper protection is off; users or malware can disable real-time protection',
  };
}

/**
 * NIST SP 800-171 3.14.2: malicious code protection stays in force. Tamper
 * protection stops local administrators and malware from switching Defender
 * real-time protection, cloud protection or the engine off.
 */
export class WindowsDefenderTamperProtectionCheck implements ComplianceCheck {
  checkType = 'defender_tamper_protection' as const;
  displayName = 'Defender Tamper Protection';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'Get-MpComputerStatus IsTamperProtected';
    try {
      const output = execSync(
        'powershell.exe -NoProfile -NonInteractive -Command "Get-MpComputerStatus | Select-Object -Property IsTamperProtected,TamperProtectionSource,AMRunningMode,RealTimeProtectionEnabled,AntivirusEnabled | ConvertTo-Json -Compress"',
        { encoding: 'utf-8', timeout: 15000 },
      ).trim();
      const status = (output ? JSON.parse(output) : {}) as DefenderStatus;
      const result = evaluateTamperProtection(status);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: { method, raw: output.substring(0, 500), message: result.message },
        checkedAt,
      };
    } catch (error) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method,
          raw: errorMessage(error).substring(0, 500),
          message:
            'Unable to read Defender status (Defender may be absent or replaced by a third-party antivirus)',
        },
        checkedAt,
      };
    }
  }
}
