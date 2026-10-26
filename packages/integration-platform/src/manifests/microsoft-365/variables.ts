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

export interface Microsoft365CheckOptions {
  includeGuests: boolean;
  includeDisabled: boolean;
  inactiveDays: number;
}

export function parseMicrosoft365Options(variables: CheckVariableValues): Microsoft365CheckOptions {
  const asBool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : typeof v === 'string' ? v === 'true' : fallback;
  const days = Number(variables.inactive_days);
  return {
    includeGuests: asBool(variables.include_guests, false),
    includeDisabled: asBool(variables.include_disabled, false),
    inactiveDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 90,
  };
}
