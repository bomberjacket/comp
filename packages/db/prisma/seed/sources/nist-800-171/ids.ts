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
  /** Shared control keyed to a Rev 3 slot (03.01.01) or a Rev 2-only key (r2:3.1.13). */
  control: (controlKey: string): string => makeId('frk_ct', `ct:${controlKey}`),
  policy: (familyR3: string): string => makeId('frk_pt', `pt:${familyR3}`),
  task: (controlKey: string): string => makeId('frk_tt', `tt:${controlKey}`),
  policyLink: (rev: Revision, controlKey: string, familyR3: string): string =>
    makeId('fcp', `fcp:${rev}:${controlKey}:${familyR3}`),
  taskLink: (rev: Revision, controlKey: string): string =>
    makeId('fct', `fct:${rev}:${controlKey}`),
};
