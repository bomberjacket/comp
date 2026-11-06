import { createHash } from 'node:crypto';

/**
 * Deterministic ids, same shape as the NIST generator (`<prefix>_<24 hex>`) but in their
 * own namespace. Keys are CSET identifiers (module key, question title, grouping key),
 * never text, so wording fixes never change an id.
 */
const NAMESPACE = 'comp-cset/v1:';

export function makeId(prefix: string, key: string): string {
  const hex = createHash('sha256')
    .update(NAMESPACE + key)
    .digest('hex');
  return `${prefix}_${hex.slice(0, 24)}`;
}

export const ids = {
  family: (): string => makeId('frk_fam', 'fam:cisa-cset'),
  framework: (module: string): string => makeId('frk', `fw:${module}`),
  requirement: (module: string, identifier: string): string =>
    makeId('frk_rq', `rq:${module}:${identifier}`),
  /** `controlKey` is a grouping key (`g:AM:G2`), a question title (`q:1.A`) or a category (`c:Access Management`). */
  control: (module: string, controlKey: string): string => makeId('frk_ct', `ct:${module}:${controlKey}`),
  policy: (module: string, familyKey: string): string => makeId('frk_pt', `pt:${module}:${familyKey}`),
  task: (module: string, controlKey: string): string => makeId('frk_tt', `tt:${module}:${controlKey}`),
  policyLink: (module: string, controlKey: string, familyKey: string): string =>
    makeId('fcp', `fcp:${module}:${controlKey}:${familyKey}`),
  taskLink: (module: string, controlKey: string): string => makeId('fct', `fct:${module}:${controlKey}`),
  answerProfile: (module: string): string => makeId('fap', `ap:${module}`),
};
