import { createHash } from 'node:crypto';

/**
 * Deterministic ids in their own namespace (`comp-water/v1`). Keys are EPA checklist
 * numbers and CPG 2.0 goal ids, never text. Controls are NOT generated here: the
 * framework reuses the CPG 2.0 control and evidence-task templates from the CSET set.
 */
const NAMESPACE = 'comp-water/v1:';

export function makeId(prefix: string, key: string): string {
  const hex = createHash('sha256')
    .update(NAMESPACE + key)
    .digest('hex');
  return `${prefix}_${hex.slice(0, 24)}`;
}

export const MODULE = 'wcat';

export const ids = {
  family: (): string => makeId('frk_fam', 'fam:water'),
  framework: (): string => makeId('frk', `fw:${MODULE}`),
  requirement: (wcatId: string): string => makeId('frk_rq', `rq:${MODULE}:${wcatId}`),
  policy: (planKey: string): string => makeId('frk_pt', `pt:${MODULE}:${planKey}`),
  interviewTask: (goal: string): string => makeId('frk_tt', `tt:${MODULE}:interview:${goal}`),
  policyLink: (goal: string, planKey: string): string => makeId('fcp', `fcp:${MODULE}:${goal}:${planKey}`),
  taskLink: (goal: string, which: string): string => makeId('fct', `fct:${MODULE}:${goal}:${which}`),
  answerProfile: (): string => makeId('fap', `ap:${MODULE}`),
};
