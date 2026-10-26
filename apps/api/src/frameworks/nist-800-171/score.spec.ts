import {
  NIST_800_171_REV2_FRAMEWORK_ID,
  NIST_800_171_REV3_FRAMEWORK_ID,
  computeNist800171Score,
  detectRevision,
  type ScoreInput,
} from './score';
import type { Nist800171Score } from './score.types';

type Fixture = Record<string, Record<string, string | null>>;

/**
 * Build a Rev 2 instance from `{ '3.1.1': { a: 'done', b: 'todo' }, ... }`.
 * A `null` status means the objective has no evidence task.
 */
function rev2Input(
  fixture: Fixture,
  extra: Partial<ScoreInput> = {},
): ScoreInput {
  const requirementDefinitions: ScoreInput['requirementDefinitions'] = [];
  const requirementMaps: ScoreInput['requirementMaps'] = [];
  const tasks: ScoreInput['tasks'] = [];
  for (const [number, objectives] of Object.entries(fixture)) {
    const controlId = `ctl_${number}`;
    for (const [letter, status] of Object.entries(objectives)) {
      const identifier = letter === '' ? number : `${number}[${letter}]`;
      const id = `req_${identifier}`;
      requirementDefinitions.push({ id, identifier });
      requirementMaps.push({ requirementId: id, controlId });
      if (status !== null) {
        tasks.push({
          id: `tsk_${identifier}`,
          title: `${identifier} Something is determined`,
          status,
          controls: [{ id: controlId }],
        });
      }
    }
  }
  return {
    frameworkId: NIST_800_171_REV2_FRAMEWORK_ID,
    frameworkName: 'NIST SP 800-171 Rev 2',
    requirementDefinitions,
    requirementMaps,
    tasks,
    ...extra,
  };
}

function scored(input: ScoreInput): Nist800171Score {
  const result = computeNist800171Score(input);
  if (!result.supported) throw new Error(result.reason);
  return result;
}

describe('detectRevision', () => {
  it('recognises the seeded framework ids and the names', () => {
    expect(detectRevision(NIST_800_171_REV2_FRAMEWORK_ID, null)).toBe(2);
    expect(detectRevision(NIST_800_171_REV3_FRAMEWORK_ID, null)).toBe(3);
    expect(detectRevision('frk_other', 'NIST SP 800-171 Rev 3')).toBe(3);
    expect(detectRevision('frk_other', 'NIST SP 800-171 Revision 2')).toBe(2);
    expect(detectRevision('frk_other', 'SOC 2')).toBeNull();
  });
});

describe('computeNist800171Score', () => {
  it('reports other frameworks as unsupported', () => {
    const result = computeNist800171Score({
      frameworkId: 'frk_soc2',
      frameworkName: 'SOC 2',
      requirementDefinitions: [],
      requirementMaps: [],
      tasks: [],
    });
    expect(result).toEqual({
      supported: false,
      reason: 'Not a NIST SP 800-171 framework',
    });
  });

  it('marks a requirement MET only when every objective is done', () => {
    const score = scored(
      rev2Input({
        '3.1.1': { a: 'done', b: 'done', c: 'done' },
        '3.1.2': { a: 'done', b: 'in_progress' },
        '3.1.3': { a: 'todo' },
        '3.12.4': { '': 'done' },
      }),
    );
    const byNumber = Object.fromEntries(
      score.requirements.map((r) => [r.number, r]),
    );
    expect(byNumber['3.1.1'].outcome).toBe('met');
    expect(byNumber['3.1.1'].deduction).toBe(0);
    expect(byNumber['3.1.2'].outcome).toBe('not_met');
    expect(byNumber['3.1.2'].deduction).toBe(5);
    expect(byNumber['3.1.2'].objectivesMet).toBe(1);
    expect(byNumber['3.1.3'].deduction).toBe(1);
    expect(score.maxScore).toBe(4);
    expect(score.score).toBe(4 - 5 - 1);
    expect(score.requirementsMet).toBe(2);
    expect(score.requirementsNotMet).toBe(2);
    expect(score.fivePointNotMet).toBe(1);
    expect(score.eligibility).toBe('fail');
  });

  it('treats not_relevant objectives as satisfied and all-N/A requirements as not applicable', () => {
    const score = scored(
      rev2Input({
        '3.1.1': { a: 'done', b: 'not_relevant' },
        '3.1.3': { a: 'not_relevant' },
        '3.12.4': { '': 'done' },
      }),
    );
    const byNumber = Object.fromEntries(
      score.requirements.map((r) => [r.number, r]),
    );
    expect(byNumber['3.1.1'].outcome).toBe('met');
    expect(byNumber['3.1.3'].outcome).toBe('not_applicable');
    expect(score.requirementsNotApplicable).toBe(1);
    expect(score.score).toBe(3);
    expect(score.eligibility).toBe('final');
  });

  it('counts an objective without an evidence task as not met and reports it', () => {
    const score = scored(
      rev2Input({ '3.1.1': { a: 'done', b: null }, '3.12.4': { '': 'done' } }),
    );
    const r = score.requirements.find((x) => x.number === '3.1.1')!;
    expect(r.outcome).toBe('not_met');
    expect(r.objectivesWithoutTask).toBe(1);
    expect(r.objectives[1]).toMatchObject({
      identifier: '3.1.1[b]',
      outcome: 'no_task',
      taskId: null,
    });
    expect(score.objectivesWithoutTask).toBe(1);
  });

  it('only matches a task linked to the objective’s control and titled with the identifier', () => {
    const input = rev2Input({
      '3.1.1': { a: 'todo' },
      '3.12.4': { '': 'done' },
    });
    // A done task for 3.1.1[a] on a different control must not count.
    input.tasks.push({
      id: 'tsk_other',
      title: '3.1.1[a] Something else',
      status: 'done',
      controls: [{ id: 'ctl_other' }],
    });
    // A task whose title merely begins with the same digits must not count either.
    input.tasks.push({
      id: 'tsk_prefix',
      title: '3.1.1[ab] Not this one',
      status: 'done',
      controls: [{ id: 'ctl_3.1.1' }],
    });
    const r = scored(input).requirements.find((x) => x.number === '3.1.1')!;
    expect(r.outcome).toBe('not_met');
    expect(r.objectives[0].taskId).toBe('tsk_3.1.1[a]');
  });

  it('is not assessable without the System Security Plan, and 3.12.4 never deducts points', () => {
    const score = scored(
      rev2Input({ '3.1.1': { a: 'done' }, '3.12.4': { '': 'todo' } }),
    );
    const ssp = score.requirements.find((x) => x.number === '3.12.4')!;
    expect(ssp.sspGate).toBe(true);
    expect(ssp.deduction).toBe(0);
    expect(ssp.poamEligible).toBe(false);
    expect(score.sspMet).toBe(false);
    expect(score.score).toBe(2);
    expect(score.eligibility).toBe('not_assessable');
  });

  it('grants Conditional status only when every open item may sit on a POA&M', () => {
    // 1-point open item, score ≥ 80 %: conditional.
    const conditional = scored(
      rev2Input({
        '3.1.1': { a: 'done' },
        '3.1.2': { a: 'done' },
        '3.1.3': { a: 'todo' },
        '3.1.4': { a: 'done' },
        '3.12.4': { '': 'done' },
      }),
    );
    expect(conditional.score / conditional.maxScore).toBeGreaterThanOrEqual(
      0.8,
    );
    expect(conditional.poamEligibleNotMet).toBe(1);
    expect(conditional.eligibility).toBe('conditional');

    // Same, but the open item is 3.1.20: excluded from POA&Ms.
    const excluded = scored(
      rev2Input({
        '3.1.1': { a: 'done' },
        '3.1.2': { a: 'done' },
        '3.1.20': { a: 'todo' },
        '3.1.4': { a: 'done' },
        '3.12.4': { '': 'done' },
      }),
    );
    expect(excluded.poamEligibleNotMet).toBe(0);
    expect(excluded.eligibility).toBe('fail');

    // A 3-point open item is never POA&M-eligible.
    const threePoint = scored(
      rev2Input({
        '3.1.1': { a: 'done' },
        '3.1.2': { a: 'done' },
        '3.1.5': { a: 'todo' },
        '3.1.4': { a: 'done' },
        '3.12.4': { '': 'done' },
      }),
    );
    expect(threePoint.eligibility).toBe('fail');
  });

  it('fails Conditional status below 80 % even with only 1-point items open', () => {
    const score = scored(
      rev2Input({
        '3.1.1': { a: 'done' },
        '3.1.3': { a: 'todo' },
        '3.1.4': { a: 'todo' },
        '3.12.4': { '': 'done' },
      }),
    );
    expect(score.score / score.maxScore).toBeLessThan(0.8);
    expect(score.eligibility).toBe('fail');
  });

  it('exposes partial-credit values but deducts the full amount until an override exists', () => {
    const score = scored(
      rev2Input({ '3.13.11': { '': 'todo' }, '3.12.4': { '': 'done' } }),
    );
    const fips = score.requirements.find((x) => x.number === '3.13.11')!;
    expect(fips.points).toBe(5);
    expect(fips.partialPoints).toBe(3);
    expect(fips.deduction).toBe(5);
    expect(fips.poamEligible).toBe(false);
  });

  it('scores Rev 3 with placeholder weights and Rev 3 identifiers', () => {
    const score = scored({
      frameworkId: NIST_800_171_REV3_FRAMEWORK_ID,
      frameworkName: 'NIST SP 800-171 Rev 3',
      requirementDefinitions: [
        { id: 'r1', identifier: 'A.03.01.01.ODP[01]' },
        { id: 'r2', identifier: 'A.03.01.01.a[01]' },
        { id: 'r3', identifier: 'A.03.17.01.a' },
        { id: 'r4', identifier: 'A.03.12.04.a' },
      ],
      requirementMaps: [
        { requirementId: 'r1', controlId: 'c1' },
        { requirementId: 'r2', controlId: 'c1' },
        { requirementId: 'r3', controlId: 'c3' },
        { requirementId: 'r4', controlId: 'c4' },
      ],
      tasks: [
        {
          id: 't1',
          title: 'A.03.01.01.ODP[01] period is defined',
          status: 'done',
          controls: [{ id: 'c1' }],
        },
        {
          id: 't2',
          title: 'A.03.01.01.a[01] accounts are defined',
          status: 'todo',
          controls: [{ id: 'c1' }],
        },
        {
          id: 't3',
          title: 'A.03.17.01.a plan is developed',
          status: 'todo',
          controls: [{ id: 'c3' }],
        },
        {
          id: 't4',
          title: 'A.03.12.04.a ssp is developed',
          status: 'done',
          controls: [{ id: 'c4' }],
        },
      ],
    });
    expect(score.revision).toBe(3);
    expect(score.placeholderWeights).toBe(true);
    const byNumber = Object.fromEntries(
      score.requirements.map((r) => [r.number, r]),
    );
    expect(byNumber['03.01.01']).toMatchObject({
      points: 5,
      placeholder: true,
      outcome: 'not_met',
      deduction: 5,
    });
    expect(byNumber['03.17.01']).toMatchObject({
      points: 1,
      placeholder: true,
      deduction: 1,
    });
    expect(byNumber['03.12.04']).toMatchObject({
      sspGate: true,
      outcome: 'met',
    });
    expect(score.maxScore).toBe(3);
    expect(score.score).toBe(3 - 6);
  });

  it('orders requirements and objectives numerically', () => {
    const score = scored(
      rev2Input({
        '3.1.10': { a: 'done' },
        '3.1.2': { b: 'done', a: 'done' },
        '3.12.4': { '': 'done' },
      }),
    );
    expect(score.requirements.map((r) => r.number)).toEqual([
      '3.1.2',
      '3.1.10',
      '3.12.4',
    ]);
    expect(score.requirements[0].objectives.map((o) => o.identifier)).toEqual([
      '3.1.2[a]',
      '3.1.2[b]',
    ]);
  });
});
