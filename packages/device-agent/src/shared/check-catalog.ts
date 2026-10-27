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
    description:
      'FIPS mode enforced: Windows "Use FIPS compliant algorithms" policy or Linux kernel fips_enabled',
    objective: '3.13.11',
    core: false,
  },
  log_forwarding: {
    label: 'Log Forwarding',
    description:
      'A log forwarding agent, Windows Event Forwarding or remote syslog sends this device’s events to the SIEM',
    objective: '3.3.1',
    core: false,
  },
  audit_policy: {
    label: 'Audit Policy',
    description:
      'Advanced audit policy (Windows) or auditd rules (Linux) log the required logon, account, privilege and process events',
    objective: '3.3.1',
    core: false,
  },
  removable_storage: {
    label: 'Removable Storage',
    description: 'Policy denies or restricts removable storage devices',
    objective: '3.8.7',
    core: false,
  },
  smb1_disabled: {
    label: 'SMBv1 Disabled',
    description: 'The legacy SMBv1 protocol is removed or disabled',
    objective: '3.4.6',
    core: false,
  },
  defender_tamper_protection: {
    label: 'Defender Tamper Protection',
    description: 'Defender tamper protection stops protection from being switched off',
    objective: '3.14.2',
    core: false,
  },
  windows_update: {
    label: 'Windows Update',
    description: 'Updates installed within 30 days, no critical or important updates pending',
    objective: '3.14.1',
    core: false,
  },
  local_admins: {
    label: 'Local Administrators',
    description:
      'The signed-in user is not an administrator and the admin or sudo group stays small',
    objective: '3.1.6',
    core: false,
  },
  gatekeeper: {
    label: 'Gatekeeper',
    description:
      'Gatekeeper assesses downloaded software before it runs (signed and notarized only)',
    objective: '3.4.8',
    core: false,
  },
  system_integrity_protection: {
    label: 'System Integrity Protection',
    description: 'SIP keeps system files, processes and extensions read-only, even to root',
    objective: '3.4.5',
    core: false,
  },
  host_firewall: {
    label: 'Host Firewall',
    description: 'The built-in host firewall is on',
    objective: '3.13.1',
    core: false,
  },
  software_update: {
    label: 'Software Update',
    description:
      'Updates current: no recommended (macOS) or security (Linux) updates pending, recent installs, automatic updates on',
    objective: '3.14.1',
    core: false,
  },
  ssh_hardening: {
    label: 'SSH Hardening',
    description:
      'OpenSSH: no root or password-only login, system use banner, idle timeout within 15 minutes',
    objective: '3.1.12',
    core: false,
  },
};

export function checkLabel(checkType: string): string {
  return CHECK_CATALOG[checkType as AnyCheckType]?.label ?? checkType;
}

export function isCoreCheck(checkType: string): boolean {
  return CHECK_CATALOG[checkType as AnyCheckType]?.core ?? false;
}
