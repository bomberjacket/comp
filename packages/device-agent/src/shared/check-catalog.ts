import type { AnyCheckType } from './types';

/**
 * One place that names every check the agent can report.
 *
 * `core` checks are the four CompAI has always measured; they decide the
 * device's compliance verdict on the server. The others are evidence: they
 * are stored and shown per device against the NIST SP 800-171 objective they
 * support, but a failure does not flip the device to non-compliant.
 */
export interface CheckDefinition {
  label: string;
  description: string;
  /** NIST SP 800-171 Rev 2 requirement the check is evidence for. */
  objective: string;
  core: boolean;
}

export const CHECK_CATALOG: Record<AnyCheckType, CheckDefinition> = {
  disk_encryption: {
    label: 'Disk Encryption',
    description: 'FileVault or BitLocker enabled',
    objective: '3.13.16',
    core: true,
  },
  antivirus: {
    label: 'Antivirus',
    description: 'Antivirus software active',
    objective: '3.14.2',
    core: true,
  },
  password_policy: {
    label: 'Password Policy',
    description: 'Minimum 8 character password',
    objective: '3.5.7',
    core: true,
  },
  screen_lock: {
    label: 'Screen Lock',
    description: 'Screen locks within 15 minutes',
    objective: '3.1.10',
    core: true,
  },
  fips_mode: {
    label: 'FIPS Mode',
    description: 'Windows "Use FIPS compliant algorithms" policy enabled',
    objective: '3.13.11',
    core: false,
  },
  log_forwarding: {
    label: 'Log Forwarding',
    description:
      'A log forwarding agent or Windows Event Forwarding sends this device’s events to the SIEM',
    objective: '3.3.1',
    core: false,
  },
};

export function checkLabel(checkType: string): string {
  return CHECK_CATALOG[checkType as AnyCheckType]?.label ?? checkType;
}

export function isCoreCheck(checkType: string): boolean {
  return CHECK_CATALOG[checkType as AnyCheckType]?.core ?? false;
}
