import { exportToCset, importFromCset, type CsetPayload } from './cset-json';

const cpgRequirements = [
  { id: 'r1a', identifier: '1.A', name: 'Establish Cybersecurity Responsibilities', family: 'Govern' },
  { id: 'r1b', identifier: '1.B', name: 'Policies', family: 'Govern' },
];

describe('importFromCset', () => {
  it('reads CPG 2.0 IT/OT follow-up rows as domain answers on the goal', () => {
    const payload: CsetPayload = {
      maturityModels: [
        {
          modelName: 'CPG2',
          groupings: [
            {
              title: 'Govern',
              questions: [
                {
                  title: '1.A',
                  answerText: 'U',
                  followupQuestions: [
                    { title: '', questionText: 'Information Technology (IT)', answerText: 'Y', comment: 'documented' },
                    { title: '', questionText: 'Operational Technology (OT)', answerText: 'S' },
                  ],
                },
                { title: '9.Z', answerText: 'N' },
              ],
            },
          ],
        },
      ],
    };
    const out = importFromCset(payload, cpgRequirements, 'it_ot');
    expect(out.answers).toEqual([
      { requirementId: 'r1a', identifier: '1.A', domain: 'it', answer: 'yes', comment: 'documented' },
      { requirementId: 'r1a', identifier: '1.A', domain: 'ot', answer: 'scoped', comment: null },
    ]);
    expect(out.unmatched).toEqual(['9.Z']);
    expect(out.seen).toBe(3);
  });

  it('reads nested maturity groupings and standard requirements with domain all', () => {
    const payload: CsetPayload = {
      maturityModels: [
        {
          modelName: 'IMR',
          groupings: [
            { title: 'EH', groupings: [{ title: 'Goal 1', questions: [{ title: 'EH:G1.Q1', answerText: 'I' }] }] },
          ],
        },
      ],
      standards: { standards: [{ setName: 'HHS405d', requirements: [{ title: '1.S.A.1', answerText: 'NA', comment: 'cloud mail' }] }] },
    };
    const out = importFromCset(
      payload,
      [
        { id: 'q1', identifier: 'EH:G1.Q1' },
        { id: 's1', identifier: '1.S.A.1' },
      ],
      'single',
    );
    expect(out.answers.map((a) => [a.requirementId, a.domain, a.answer])).toEqual([
      ['q1', 'all', 'incomplete'],
      ['s1', 'all', 'not_applicable'],
    ]);
  });

  it('skips unanswered items and unknown codes without counting them as unmatched', () => {
    const out = importFromCset(
      { standards: { standards: [{ requirements: [{ title: '1.S.A.1', answerText: 'U' }, { title: '1.S.A.2', answerText: '' }] }] } },
      [{ id: 's1', identifier: '1.S.A.1' }],
      'single',
    );
    expect(out.answers).toEqual([]);
    expect(out.unmatched).toEqual([]);
    expect(out.seen).toBe(2);
  });
});

describe('exportToCset', () => {
  it('round-trips through importFromCset for an it_ot module', () => {
    const exported = exportToCset({
      frameworkName: 'CPG 2.0',
      modelName: 'CPG2',
      kind: 'maturity',
      domainMode: 'it_ot',
      requirements: cpgRequirements,
      answers: [
        { requirementId: 'r1a', domain: 'it', answer: 'yes', comment: 'ok' },
        { requirementId: 'r1b', domain: 'ot', answer: 'no', comment: null },
      ],
    });
    const back = importFromCset(exported, cpgRequirements, 'it_ot');
    expect(back.answers).toEqual([
      { requirementId: 'r1a', identifier: '1.A', domain: 'it', answer: 'yes', comment: 'ok' },
      { requirementId: 'r1b', identifier: '1.B', domain: 'ot', answer: 'no', comment: null },
    ]);
  });

  it('writes a standard set with U for unanswered rows', () => {
    const exported = exportToCset({
      frameworkName: 'HHS 405(d)',
      modelName: 'HHS405d',
      kind: 'standard',
      domainMode: 'single',
      requirements: [{ id: 's1', identifier: '1.S.A.1', name: 'No free mail', family: 'E-mail' }],
      answers: [],
    });
    expect(exported.standards?.standards?.[0]?.requirements?.[0]).toMatchObject({ title: '1.S.A.1', answerText: 'U' });
  });
});
