/**
 * NIST SP 800-171 Rev 2 point values, as enumerated in 32 CFR 170.24(c)(2)
 * (CMMC Level 2 scoring methodology, identical to the DoD Assessment
 * Methodology v1.2.1 Annex A). Max score 110; every NOT MET requirement
 * subtracts its value, so the score can go negative (floor is -203).
 *
 * Keyed by the bare requirement number ("3.1.1"). Rev 3 has no published
 * methodology yet: `rev3PointValue` carries the Rev 2 value of the
 * identically numbered requirement as a flagged placeholder.
 */

export type PointValue = 1 | 3 | 5;

export interface RequirementScoring {
  /** Points subtracted when the requirement is NOT MET. */
  points: PointValue;
  /** Reduced deduction when the rule's partial-credit condition holds (3.5.3, 3.13.11). */
  partialPoints?: 3;
  /** 3.12.4: no points; without an SSP the assessment cannot be completed. */
  sspGate?: boolean;
  /** Rev 3 only: value carried from Rev 2 pending a DoD methodology. */
  placeholder?: boolean;
}

const FIVE_POINT = new Set([
  // Basic requirements
  '3.1.1',
  '3.1.2',
  '3.2.1',
  '3.2.2',
  '3.3.1',
  '3.4.1',
  '3.4.2',
  '3.5.1',
  '3.5.2',
  '3.6.1',
  '3.6.2',
  '3.7.2',
  '3.8.3',
  '3.9.2',
  '3.10.1',
  '3.10.2',
  '3.12.1',
  '3.12.3',
  '3.13.1',
  '3.13.2',
  '3.14.1',
  '3.14.2',
  '3.14.3',
  // Derived requirements
  '3.1.12',
  '3.1.13',
  '3.1.16',
  '3.1.17',
  '3.1.18',
  '3.3.5',
  '3.4.5',
  '3.4.6',
  '3.4.7',
  '3.4.8',
  '3.5.10',
  '3.7.5',
  '3.8.7',
  '3.11.2',
  '3.13.5',
  '3.13.6',
  '3.13.15',
  '3.14.4',
  '3.14.6',
]);

const THREE_POINT = new Set([
  // Basic requirements
  '3.3.2',
  '3.7.1',
  '3.8.1',
  '3.8.2',
  '3.9.1',
  '3.11.1',
  '3.12.2',
  // Derived requirements
  '3.1.5',
  '3.1.19',
  '3.7.4',
  '3.8.8',
  '3.13.8',
  '3.14.5',
  '3.14.7',
]);

/** 5 points, or 3 when the partial-credit condition in 170.24(c)(2)(i)(B) holds. */
const PARTIAL_CREDIT = new Set(['3.5.3', '3.13.11']);

/** System Security Plan: not scored; its absence means no assessment. */
export const SSP_REQUIREMENT = '3.12.4';

/**
 * Never allowed on a Level 2 POA&M regardless of value (32 CFR 170.21(a)(2)(ii)).
 * 3.13.11 is the inverse case: allowed at its partial value of 3.
 */
export const POAM_EXCLUDED = new Set([
  '3.1.20',
  '3.1.22',
  '3.10.3',
  '3.10.4',
  '3.10.5',
  SSP_REQUIREMENT,
]);

/** Minimum score ratio for Conditional Level 2 status (32 CFR 170.21(a)(2)(i)). */
export const CONDITIONAL_MIN_RATIO = 0.8;

/** Requirements per Rev 2 family, 3.1 through 3.14 (110 in total). */
const REV2_FAMILY_SIZES = [22, 3, 9, 9, 11, 3, 6, 9, 2, 6, 3, 4, 16, 7];

export const REV2_REQUIREMENTS: readonly string[] = REV2_FAMILY_SIZES.flatMap(
  (size, i) => Array.from({ length: size }, (_, j) => `3.${i + 1}.${j + 1}`),
);

export function rev2PointValue(requirement: string): RequirementScoring | null {
  if (!REV2_REQUIREMENTS.includes(requirement)) return null;
  if (requirement === SSP_REQUIREMENT) return { points: 1, sspGate: true };
  if (PARTIAL_CREDIT.has(requirement)) return { points: 5, partialPoints: 3 };
  if (FIVE_POINT.has(requirement)) return { points: 5 };
  if (THREE_POINT.has(requirement)) return { points: 3 };
  return { points: 1 };
}

/** "03.01.01" → "3.1.1"; the renumbering Rev 3 applied to every carried requirement. */
export function rev3ToRev2Number(requirement: string): string {
  return requirement
    .split('.')
    .map((part) => String(Number.parseInt(part, 10)))
    .join('.');
}

export function rev3PointValue(requirement: string): RequirementScoring {
  const carried = rev2PointValue(rev3ToRev2Number(requirement));
  return { ...(carried ?? { points: 1 }), placeholder: true };
}

/**
 * Requirement number of an assessment-objective identifier.
 * Rev 2: "3.1.1[a]" → "3.1.1", "3.4.4" → "3.4.4".
 * Rev 3: "A.03.01.01.a[01]", "A.03.01.01.ODP[01]", "A.03.01.09" → "03.01.01" / "03.01.09".
 */
export function requirementNumberOf(
  identifier: string,
  revision: 2 | 3,
): string | null {
  const id = identifier.trim();
  if (revision === 2) {
    const m = /^(3\.\d{1,2}\.\d{1,2})(\[|$)/.exec(id);
    return m ? m[1] : null;
  }
  const m = /^A\.(\d{2}\.\d{2}\.\d{2})(\.|\[|$)/.exec(id);
  return m ? m[1] : null;
}
