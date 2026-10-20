import { createHash } from 'node:crypto';
import type { Revision } from './types';

/**
 * Deterministic ids. Shape matches upstream `generate_prefixed_cuid`: `<prefix>_<24 hex>`.
 * Keys are NIST identifiers, never text, so wording fixes never change an id.
 */
const NAMESPACE = 'comp-nist-800-171/v1:';

export function makeId(prefix: string, key: string): string {
  const hex = createHash('sha256')
    .update(NAMESPACE + key)
    .digest('hex');
  return `${prefix}_${hex.slice(0, 24)}`;
}

export const ids = {
  family: (): string => makeId('frk_fam', 'fam:nist-sp-800-171'),
  framework: (rev: Revision): string => makeId('frk', `fw:${rev}`),
  requirement: (rev: Revision, identifier: string): string =>
    makeId('frk_rq', `rq:${rev}:${identifier}`),
  /** One control per security requirement and revision: `r2:3.1.1`, `r3:03.01.01`. */
  control: (rev: Revision, requirementId: string): string =>
    makeId('frk_ct', `ct:${rev}:${requirementId}`),
  policy: (familyR3: string): string => makeId('frk_pt', `pt:${familyR3}`),
  /** One task per assessment objective: `r2:3.1.1[a]`, `r3:A.03.01.01.a[01]`. */
  task: (rev: Revision, objectiveIdentifier: string): string =>
    makeId('frk_tt', `tt:${rev}:${objectiveIdentifier}`),
  policyLink: (rev: Revision, requirementId: string, familyR3: string): string =>
    makeId('fcp', `fcp:${rev}:${requirementId}:${familyR3}`),
  taskLink: (rev: Revision, objectiveIdentifier: string): string =>
    makeId('fct', `fct:${rev}:${objectiveIdentifier}`),
};
