import type { CheckResult } from '../shared/types';

/** Field limits enforced by the API's check-in DTO; a longer value fails the whole check-in. */
const DETAIL_LIMITS = { method: 100, raw: 2000, message: 1000, exception: 500 } as const;

export function clampDetails(result: CheckResult): CheckResult {
  const d = result.details;
  return {
    ...result,
    details: {
      ...d,
      method: d.method.substring(0, DETAIL_LIMITS.method),
      raw: d.raw.substring(0, DETAIL_LIMITS.raw),
      message: d.message.substring(0, DETAIL_LIMITS.message),
      ...(d.exception !== undefined
        ? { exception: d.exception.substring(0, DETAIL_LIMITS.exception) }
        : {}),
    },
  };
}
