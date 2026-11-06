import type { CheckVariable, CheckVariableValues } from '../../types';

export const shouldPoliciesVariable: CheckVariable = {
  id: 'should_policies',
  label: 'SHOULD policies not met',
  type: 'select',
  required: false,
  default: 'informational',
  options: [
    { value: 'informational', label: 'Record as informational (task is not failed)' },
    { value: 'findings', label: 'Record as findings (task is failed until fixed or excepted)' },
  ],
  helpText:
    'ScubaGear reports an unmet SHOULD policy as a Warning. SHALL policies that fail are always findings.',
};

export const maxReportAgeDaysVariable: CheckVariable = {
  id: 'max_report_age_days',
  label: 'Maximum report age (days)',
  type: 'number',
  required: false,
  default: 90,
  helpText:
    'A ScubaGear report older than this no longer counts as evidence: every check reports the report as stale until a new one is uploaded.',
};

export interface ScubaGearOptions {
  warningsAsFindings: boolean;
  maxReportAgeDays: number;
}

export function parseScubaGearOptions(variables: CheckVariableValues): ScubaGearOptions {
  const raw = variables.max_report_age_days;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return {
    warningsAsFindings: variables.should_policies === 'findings',
    maxReportAgeDays: Number.isFinite(n) && n > 0 ? n : 90,
  };
}
