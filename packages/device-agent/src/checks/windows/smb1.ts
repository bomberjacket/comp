import { askHelper } from '../../helper/client';
import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { asNumber, errorMessage, parseJsonObject, runPowerShellScript } from './powershell';

const SCRIPT = `
$r = @{}
try { $f = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop; $r.featureState = [string]$f.State } catch { $r.featureError = $_.Exception.Message }
$r.serverSmb1 = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters' -Name SMB1 -ErrorAction SilentlyContinue).SMB1
$r.clientServicePresent = [bool](Get-Service -Name mrxsmb10 -ErrorAction SilentlyContinue)
$r.clientStart = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mrxsmb10' -Name Start -ErrorAction SilentlyContinue).Start
$r | ConvertTo-Json -Compress
`;

export interface Smb1Snapshot {
  featureState?: string | null;
  featureError?: string | null;
  serverSmb1?: unknown;
  clientServicePresent?: boolean | null;
  clientStart?: unknown;
}

export function evaluateSmb1(s: Smb1Snapshot): { passed: boolean; message: string } {
  const state = (s.featureState ?? '').toLowerCase();
  if (state) {
    if (state.startsWith('disabled')) {
      return {
        passed: true,
        message: `SMB1Protocol feature is ${s.featureState} (SMBv1 server and client unavailable)`,
      };
    }
    const bothOff = asNumber(s.serverSmb1) === 0 && asNumber(s.clientStart) === 4;
    return {
      passed: bothOff,
      message: bothOff
        ? 'SMB1Protocol feature is installed but the SMBv1 server and client are both disabled'
        : `SMB1Protocol feature is ${s.featureState}; SMBv1 is available on this device`,
    };
  }
  // Feature state unreadable without elevation: judge from registry and the client driver service.
  const serverOff =
    asNumber(s.serverSmb1) === 0 || (s.serverSmb1 == null && s.clientServicePresent === false);
  const clientOff = s.clientServicePresent === false || asNumber(s.clientStart) === 4;
  const passed = serverOff && clientOff;
  return {
    passed,
    message: passed
      ? 'SMBv1 server disabled and SMBv1 client driver absent or disabled (feature state read needs elevation)'
      : `SMBv1 is available: server ${asNumber(s.serverSmb1) === 0 ? 'disabled' : 'enabled or default'}, client driver ${s.clientServicePresent === false ? 'absent' : asNumber(s.clientStart) === 4 ? 'disabled' : 'present'}`,
  };
}

/**
 * NIST SP 800-171 3.4.6: least functionality. SMBv1 is the legacy file
 * sharing protocol behind WannaCry and NotPetya; current Windows does not
 * install it by default, and this check proves it stayed off.
 */
export class WindowsSmb1Check implements ComplianceCheck {
  checkType = 'smb1_disabled' as const;
  displayName = 'SMBv1 Disabled';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const output = runPowerShellScript(SCRIPT, 30000);
      const snapshot = parseJsonObject<Smb1Snapshot>(output);
      // The feature state needs administrator rights; the privileged helper
      // (SYSTEM) supplies it when installed.
      let method = 'Get-WindowsOptionalFeature SMB1Protocol, LanmanServer SMB1, mrxsmb10';
      if (!snapshot.featureState) {
        const helper = await askHelper('smb1-feature');
        if (helper?.ok && helper.output) {
          snapshot.featureState = helper.output.trim();
          method += ' (feature state via privileged helper)';
        }
      }
      const result = evaluateSmb1(snapshot);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method,
          raw: output.substring(0, 800),
          message: result.message,
        },
        checkedAt,
      };
    } catch (error) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method: 'Get-WindowsOptionalFeature SMB1Protocol, LanmanServer SMB1, mrxsmb10',
          raw: errorMessage(error).substring(0, 500),
          message: 'Unable to determine the SMBv1 state',
        },
        checkedAt,
      };
    }
  }
}
