import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { asNumber, errorMessage, parseJsonObject, runPowerShellScript } from './powershell';

const SCRIPT = `
$r = @{}
$base = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices'
$disk = Join-Path $base '{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}'
$r.denyAll = (Get-ItemProperty -Path $base -Name Deny_All -ErrorAction SilentlyContinue).Deny_All
$r.diskDenyRead = (Get-ItemProperty -Path $disk -Name Deny_Read -ErrorAction SilentlyContinue).Deny_Read
$r.diskDenyWrite = (Get-ItemProperty -Path $disk -Name Deny_Write -ErrorAction SilentlyContinue).Deny_Write
$r.diskDenyExecute = (Get-ItemProperty -Path $disk -Name Deny_Execute -ErrorAction SilentlyContinue).Deny_Execute
$r.usbstorStart = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR' -Name Start -ErrorAction SilentlyContinue).Start
$r.mdmDenyWrite = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\PolicyManager\\current\\device\\Storage' -Name RemovableDiskDenyWriteAccess -ErrorAction SilentlyContinue).RemovableDiskDenyWriteAccess
$r | ConvertTo-Json -Compress
`;

export interface RemovableStorageSnapshot {
  denyAll?: unknown;
  diskDenyRead?: unknown;
  diskDenyWrite?: unknown;
  diskDenyExecute?: unknown;
  usbstorStart?: unknown;
  mdmDenyWrite?: unknown;
}

export function evaluateRemovableStorage(s: RemovableStorageSnapshot): {
  passed: boolean;
  controls: string[];
  message: string;
} {
  const controls: string[] = [];
  if (asNumber(s.denyAll) === 1) controls.push('all removable storage classes denied by policy');
  if (asNumber(s.diskDenyRead) === 1) controls.push('removable disks: read denied');
  if (asNumber(s.diskDenyWrite) === 1) controls.push('removable disks: write denied');
  if (asNumber(s.usbstorStart) === 4) controls.push('USB mass storage driver disabled');
  if (asNumber(s.mdmDenyWrite) === 1) controls.push('MDM policy denies write to removable disks');
  const executeOnly = controls.length === 0 && asNumber(s.diskDenyExecute) === 1;
  const passed = controls.length > 0;
  return {
    passed,
    controls,
    message: passed
      ? `Removable storage is controlled (${controls.join('; ')})`
      : executeOnly
        ? 'Only execution from removable disks is denied; read and write are still allowed'
        : 'No policy restricts removable storage on this device',
  };
}

/**
 * NIST SP 800-171 3.8.7: the use of removable media is controlled. Reads the
 * Group Policy and MDM removable storage access policies and the USB mass
 * storage driver start type. Evidence only; the organization may control
 * media with Defender device control or procedure instead.
 */
export class WindowsRemovableStorageCheck implements ComplianceCheck {
  checkType = 'removable_storage' as const;
  displayName = 'Removable Storage';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const output = runPowerShellScript(SCRIPT);
      const result = evaluateRemovableStorage(parseJsonObject<RemovableStorageSnapshot>(output));
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method: 'RemovableStorageDevices policy, USBSTOR, PolicyManager Storage',
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
          method: 'RemovableStorageDevices policy, USBSTOR, PolicyManager Storage',
          raw: errorMessage(error).substring(0, 500),
          message: 'Unable to read the removable storage policy',
        },
        checkedAt,
      };
    }
  }
}
