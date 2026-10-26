import type { CheckVariable, CheckVariableValues } from '../../types';

export const includeGuestsVariable: CheckVariable = {
  id: 'include_guests',
  label: 'Include guest accounts',
  type: 'boolean',
  required: false,
  default: false,
  helpText:
    'Guest (B2B) accounts are outside the CUI user population by default. Turn on to hold guests to the same MFA and activity checks.',
};

export const includeDisabledVariable: CheckVariable = {
  id: 'include_disabled',
  label: 'Include disabled accounts',
  type: 'boolean',
  required: false,
  default: false,
  helpText: 'Disabled accounts are skipped by default; they cannot sign in.',
};

export const inactiveDaysVariable: CheckVariable = {
  id: 'inactive_days',
  label: 'Inactivity period (days)',
  type: 'number',
  required: false,
  default: 90,
  helpText:
    'Accounts with no sign-in for this many days are reported for 3.5.6. Match the period defined in your access control policy.',
};

export const deviceStaleDaysVariable: CheckVariable = {
  id: 'device_stale_days',
  label: 'Device check-in period (days)',
  type: 'number',
  required: false,
  default: 30,
  helpText:
    'Intune-managed devices that have not synced for this many days are reported as stale inventory for 3.4.1.',
};

export const scanMaxDaysVariable: CheckVariable = {
  id: 'scan_max_days',
  label: 'Malware scan frequency (days)',
  type: 'number',
  required: false,
  default: 7,
  helpText:
    'The scan frequency defined for 3.14.5. Windows devices whose last Defender quick or full scan is older than this are reported.',
};

export const auditRetentionDaysVariable: CheckVariable = {
  id: 'audit_retention_days',
  label: 'Audit record retention (days)',
  type: 'number',
  required: false,
  default: 365,
  helpText:
    'The retention period defined for 3.3.1. Entra ID keeps at most 30 days natively; longer periods rely on export to a Log Analytics (Sentinel) workspace or storage account.',
};

export interface AuditCheckOptions {
  retentionDays: number;
}

export function parseAuditOptions(variables: CheckVariableValues): AuditCheckOptions {
  return { retentionDays: positiveDays(variables.audit_retention_days, 365) };
}

export interface Microsoft365CheckOptions {
  includeGuests: boolean;
  includeDisabled: boolean;
  inactiveDays: number;
}

export interface DeviceCheckOptions {
  staleDays: number;
  scanMaxDays: number;
}

function positiveDays(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parseMicrosoft365Options(variables: CheckVariableValues): Microsoft365CheckOptions {
  const asBool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : typeof v === 'string' ? v === 'true' : fallback;
  return {
    includeGuests: asBool(variables.include_guests, false),
    includeDisabled: asBool(variables.include_disabled, false),
    inactiveDays: positiveDays(variables.inactive_days, 90),
  };
}

export function parseDeviceOptions(variables: CheckVariableValues): DeviceCheckOptions {
  return {
    staleDays: positiveDays(variables.device_stale_days, 30),
    scanMaxDays: positiveDays(variables.scan_max_days, 7),
  };
}
