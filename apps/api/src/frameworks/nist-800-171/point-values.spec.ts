import {
  POAM_EXCLUDED,
  REV2_REQUIREMENTS,
  requirementNumberOf,
  rev2PointValue,
  rev3PointValue,
  rev3ToRev2Number,
} from './point-values';

describe('NIST SP 800-171 point values (32 CFR 170.24)', () => {
  it('enumerates all 110 Rev 2 requirements', () => {
    expect(REV2_REQUIREMENTS).toHaveLength(110);
    expect(new Set(REV2_REQUIREMENTS).size).toBe(110);
    expect(REV2_REQUIREMENTS[0]).toBe('3.1.1');
    expect(REV2_REQUIREMENTS[109]).toBe('3.14.7');
  });

  it('matches the rule: 42 five-point, 14 three-point, 2 partial-credit, 1 SSP gate, 51 one-point', () => {
    const all = REV2_REQUIREMENTS.map((n) => ({ n, s: rev2PointValue(n)! }));
    const five = all.filter((x) => x.s.points === 5 && !x.s.partialPoints);
    const three = all.filter((x) => x.s.points === 3);
    const partial = all.filter((x) => x.s.partialPoints);
    const ssp = all.filter((x) => x.s.sspGate);
    const one = all.filter((x) => x.s.points === 1 && !x.s.sspGate);
    expect(five).toHaveLength(42);
    expect(three).toHaveLength(14);
    expect(partial.map((x) => x.n)).toEqual(['3.5.3', '3.13.11']);
    expect(ssp.map((x) => x.n)).toEqual(['3.12.4']);
    expect(one).toHaveLength(51);
    // Lowest possible score is -203: 110 minus every deduction.
    const totalDeductions = all.reduce(
      (sum, x) => sum + (x.s.sspGate ? 0 : x.s.points),
      0,
    );
    expect(110 - totalDeductions).toBe(-203);
  });

  it('assigns the values the rule names explicitly', () => {
    expect(rev2PointValue('3.1.1')).toEqual({ points: 5 });
    expect(rev2PointValue('3.13.15')).toEqual({ points: 5 });
    expect(rev2PointValue('3.12.2')).toEqual({ points: 3 });
    expect(rev2PointValue('3.14.7')).toEqual({ points: 3 });
    expect(rev2PointValue('3.1.3')).toEqual({ points: 1 });
    expect(rev2PointValue('3.5.3')).toEqual({ points: 5, partialPoints: 3 });
    expect(rev2PointValue('3.13.11')).toEqual({ points: 5, partialPoints: 3 });
    expect(rev2PointValue('3.12.4')).toEqual({ points: 1, sspGate: true });
    expect(rev2PointValue('3.1.23')).toBeNull();
    expect(rev2PointValue('9.9.9')).toBeNull();
  });

  it('lists the POA&M exclusions from 32 CFR 170.21', () => {
    expect([...POAM_EXCLUDED].sort()).toEqual(
      ['3.1.20', '3.1.22', '3.10.3', '3.10.4', '3.10.5', '3.12.4'].sort(),
    );
  });

  it('carries Rev 2 values to Rev 3 numbers as placeholders', () => {
    expect(rev3ToRev2Number('03.01.01')).toBe('3.1.1');
    expect(rev3ToRev2Number('03.13.15')).toBe('3.13.15');
    expect(rev3PointValue('03.01.01')).toEqual({
      points: 5,
      placeholder: true,
    });
    expect(rev3PointValue('03.17.01')).toEqual({
      points: 1,
      placeholder: true,
    });
    expect(rev3PointValue('03.12.04')).toEqual({
      points: 1,
      sspGate: true,
      placeholder: true,
    });
  });

  it('extracts the requirement number from objective identifiers', () => {
    expect(requirementNumberOf('3.1.1[a]', 2)).toBe('3.1.1');
    expect(requirementNumberOf('3.13.11', 2)).toBe('3.13.11');
    expect(requirementNumberOf('3.4.4 ', 2)).toBe('3.4.4');
    expect(requirementNumberOf('A.03.01.01.a[01]', 3)).toBe('03.01.01');
    expect(requirementNumberOf('A.03.01.01.ODP[01]', 3)).toBe('03.01.01');
    expect(requirementNumberOf('A.03.01.01.c.01', 3)).toBe('03.01.01');
    expect(requirementNumberOf('A.03.01.09', 3)).toBe('03.01.09');
    expect(requirementNumberOf('CC6.1', 2)).toBeNull();
    expect(requirementNumberOf('3.1.1[a]', 3)).toBeNull();
  });
});
