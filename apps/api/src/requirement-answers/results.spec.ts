import {
  computeResults,
  effectiveDomains,
  taskStatusFor,
  type AnswerDomain,
  type ResultsInput,
} from './results';

const requirements: ResultsInput['requirements'] = [
  { id: 'r1', identifier: '1.A', name: 'A', family: 'Govern', controlId: 'c1' },
  { id: 'r2', identifier: '1.B', name: 'B', family: 'Govern', controlId: 'c2' },
  { id: 'r3', identifier: '2.A', name: 'C', family: 'Identify', controlId: 'c3' },
];
const controls = [
  { id: 'c1', name: '1.A' },
  { id: 'c2', name: '1.B' },
  { id: 'c3', name: '2.A' },
];

describe('effectiveDomains', () => {
  it('is all for single-domain modules', () => {
    expect(effectiveDomains('single', ['it'])).toEqual(['all']);
  });
  it('defaults it_ot to both domains and keeps a chosen subset', () => {
    expect(effectiveDomains('it_ot', [])).toEqual(['it', 'ot']);
    expect(effectiveDomains('it_ot', ['ot'])).toEqual(['ot']);
  });
});

describe('computeResults', () => {
  it('counts per domain, family and control and scores yes+alternate over answerable', () => {
    const out = computeResults({
      profile: { answerOptions: ['Y', 'I', 'S', 'N'], domainMode: 'it_ot', scoring: 'cpg' },
      domains: [],
      requirements,
      controls,
      answers: [
        { requirementId: 'r1', domain: 'it', answer: 'yes' },
        { requirementId: 'r2', domain: 'it', answer: 'no' },
        { requirementId: 'r3', domain: 'it', answer: 'not_applicable' },
        { requirementId: 'r1', domain: 'ot', answer: 'incomplete' },
      ],
    });
    expect(out.domains).toEqual(['it', 'ot']);
    expect(out.expected).toBe(6);
    expect(out.answered).toBe(4);
    const it = out.totals.find((t) => t.domain === 'it');
    expect(it?.counts).toMatchObject({ yes: 1, no: 1, not_applicable: 1, unanswered: 0 });
    expect(it?.percent).toBe(50); // 1 yes of 2 answerable
    const ot = out.totals.find((t) => t.domain === 'ot');
    expect(ot?.counts.unanswered).toBe(2);
    const govIt = out.families.find((f) => f.key === 'Govern' && f.domain === 'it');
    expect(govIt?.total).toBe(2);
    expect(govIt?.achieved).toBe(false);
    const c1It = out.controls.find((c) => c.key === 'c1' && c.domain === 'it');
    expect(c1It?.achieved).toBe(true);
  });

  it('treats a fully not-applicable group as not achieved and 0 percent', () => {
    const out = computeResults({
      profile: { answerOptions: ['Y', 'N', 'NA', 'A'], domainMode: 'single', scoring: 'standard' },
      domains: [],
      requirements: [requirements[0] as ResultsInput['requirements'][number]],
      controls,
      answers: [{ requirementId: 'r1', domain: 'all', answer: 'not_applicable' }],
    });
    expect(out.totals[0]?.percent).toBe(0);
    expect(out.totals[0]?.achieved).toBe(false);
  });
});

describe('taskStatusFor', () => {
  const domains: AnswerDomain[] = ['all'];
  it('is null until something is answered', () => {
    expect(taskStatusFor(['r1', 'r2'], domains, [])).toBeNull();
  });
  it('is todo while any requirement is open or unanswered', () => {
    expect(
      taskStatusFor(['r1', 'r2'], domains, [{ requirementId: 'r1', domain: 'all', answer: 'yes' }]),
    ).toBe('todo');
    expect(
      taskStatusFor(['r1'], domains, [{ requirementId: 'r1', domain: 'all', answer: 'incomplete' }]),
    ).toBe('todo');
  });
  it('is done when every requirement is yes, alternate or not applicable', () => {
    expect(
      taskStatusFor(['r1', 'r2'], domains, [
        { requirementId: 'r1', domain: 'all', answer: 'alternate' },
        { requirementId: 'r2', domain: 'all', answer: 'not_applicable' },
      ]),
    ).toBe('done');
  });
  it('is not_relevant only when everything is not applicable, across both domains', () => {
    expect(
      taskStatusFor(['r1'], ['it', 'ot'], [
        { requirementId: 'r1', domain: 'it', answer: 'not_applicable' },
        { requirementId: 'r1', domain: 'ot', answer: 'not_applicable' },
      ]),
    ).toBe('not_relevant');
    expect(
      taskStatusFor(['r1'], ['it', 'ot'], [
        { requirementId: 'r1', domain: 'it', answer: 'not_applicable' },
      ]),
    ).toBe('todo');
  });
});
