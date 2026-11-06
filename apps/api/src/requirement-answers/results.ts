/**
 * Pure roll-up of per-question answers for a question-based framework (CISA CSET
 * modules). No database access; the service feeds it rows and the UI renders it.
 */
export type AnswerDomain = 'all' | 'it' | 'ot';
export type AnswerValue =
  | 'yes'
  | 'incomplete'
  | 'scoped'
  | 'no'
  | 'not_applicable'
  | 'alternate';
export type AnswerScoringModel = 'cpg' | 'mil' | 'tier' | 'standard';
export type AnswerDomainMode = 'single' | 'it_ot';

export const ANSWER_VALUES: AnswerValue[] = [
  'yes',
  'incomplete',
  'scoped',
  'no',
  'not_applicable',
  'alternate',
];

/** CSET option code -> answer value; the profile's `answerOptions` lists the codes in use. */
export const CSET_CODE_TO_VALUE: Record<string, AnswerValue> = {
  Y: 'yes',
  I: 'incomplete',
  S: 'scoped',
  N: 'no',
  NA: 'not_applicable',
  A: 'alternate',
};
export const VALUE_TO_CSET_CODE: Record<AnswerValue, string> = {
  yes: 'Y',
  incomplete: 'I',
  scoped: 'S',
  no: 'N',
  not_applicable: 'NA',
  alternate: 'A',
};

export interface ResultsInput {
  profile: { answerOptions: string[]; domainMode: AnswerDomainMode; scoring: AnswerScoringModel };
  /** domains the organization answers (it_ot only); empty = both */
  domains: AnswerDomain[];
  requirements: {
    id: string;
    identifier: string;
    name: string;
    family: string | null;
    controlId: string | null;
  }[];
  controls: { id: string; name: string }[];
  answers: { requirementId: string; domain: AnswerDomain; answer: AnswerValue }[];
}

export type Counts = Record<AnswerValue | 'unanswered', number>;

export interface GroupResult {
  key: string;
  label: string;
  domain: AnswerDomain;
  counts: Counts;
  total: number;
  /** yes + alternate over answerable (total minus not_applicable), 0..100 */
  percent: number;
  /** mil scoring: every answerable item is yes or alternate */
  achieved: boolean;
}

export interface ResultsOutput {
  domains: AnswerDomain[];
  totals: GroupResult[];
  families: GroupResult[];
  controls: GroupResult[];
  answered: number;
  expected: number;
}

export function emptyCounts(): Counts {
  return {
    yes: 0,
    incomplete: 0,
    scoped: 0,
    no: 0,
    not_applicable: 0,
    alternate: 0,
    unanswered: 0,
  };
}

/** Domains an instance answers: `all` for single-domain modules, else the chosen subset. */
export function effectiveDomains(
  mode: AnswerDomainMode,
  chosen: AnswerDomain[],
): AnswerDomain[] {
  if (mode === 'single') return ['all'];
  const picked = chosen.filter((d) => d === 'it' || d === 'ot');
  return picked.length > 0 ? picked : ['it', 'ot'];
}

function finish(
  key: string,
  label: string,
  domain: AnswerDomain,
  counts: Counts,
): GroupResult {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const answerable = total - counts.not_applicable;
  const good = counts.yes + counts.alternate;
  return {
    key,
    label,
    domain,
    counts,
    total,
    percent: answerable > 0 ? Math.round((good / answerable) * 100) : 0,
    achieved: answerable > 0 && good === answerable,
  };
}

export function computeResults(input: ResultsInput): ResultsOutput {
  const domains = effectiveDomains(input.profile.domainMode, input.domains);
  const lookup = new Map<string, AnswerValue>();
  for (const a of input.answers) lookup.set(`${a.requirementId}|${a.domain}`, a.answer);
  const controlName = new Map(input.controls.map((c) => [c.id, c.name]));

  const totals = new Map<string, Counts>();
  const families = new Map<string, { label: string; counts: Counts }>();
  const controls = new Map<string, { label: string; counts: Counts }>();
  let answered = 0;
  for (const domain of domains) {
    totals.set(domain, emptyCounts());
    for (const r of input.requirements) {
      const value = lookup.get(`${r.id}|${domain}`);
      const bucket: AnswerValue | 'unanswered' = value ?? 'unanswered';
      if (value) answered++;
      (totals.get(domain) as Counts)[bucket]++;
      const famKey = `${r.family ?? 'Other'}|${domain}`;
      if (!families.has(famKey))
        families.set(famKey, { label: r.family ?? 'Other', counts: emptyCounts() });
      (families.get(famKey) as { counts: Counts }).counts[bucket]++;
      if (r.controlId) {
        const ctlKey = `${r.controlId}|${domain}`;
        if (!controls.has(ctlKey))
          controls.set(ctlKey, {
            label: controlName.get(r.controlId) ?? r.controlId,
            counts: emptyCounts(),
          });
        (controls.get(ctlKey) as { counts: Counts }).counts[bucket]++;
      }
    }
  }

  const split = (key: string): AnswerDomain => key.slice(key.lastIndexOf('|') + 1) as AnswerDomain;
  const strip = (key: string): string => key.slice(0, key.lastIndexOf('|'));
  return {
    domains,
    totals: [...totals.entries()].map(([d, c]) => finish('total', 'All', d as AnswerDomain, c)),
    families: [...families.entries()].map(([k, v]) => finish(strip(k), v.label, split(k), v.counts)),
    controls: [...controls.entries()].map(([k, v]) => finish(strip(k), v.label, split(k), v.counts)),
    answered,
    expected: input.requirements.length * domains.length,
  };
}

/**
 * Task status a control's evidence task should carry, from the answers to the
 * control's requirements across the domains in play. `null` = nothing answered yet,
 * leave the task alone.
 */
export function taskStatusFor(
  requirementIds: string[],
  domains: AnswerDomain[],
  answers: { requirementId: string; domain: AnswerDomain; answer: AnswerValue }[],
): 'done' | 'not_relevant' | 'todo' | null {
  const lookup = new Map<string, AnswerValue>();
  for (const a of answers) lookup.set(`${a.requirementId}|${a.domain}`, a.answer);
  let seen = 0;
  let satisfied = 0;
  let notApplicable = 0;
  const expected = requirementIds.length * domains.length;
  for (const id of requirementIds) {
    for (const d of domains) {
      const v = lookup.get(`${id}|${d}`);
      if (!v) continue;
      seen++;
      if (v === 'not_applicable') notApplicable++;
      else if (v === 'yes' || v === 'alternate') satisfied++;
    }
  }
  if (seen === 0) return null;
  if (seen === expected && notApplicable === expected) return 'not_relevant';
  if (seen === expected && satisfied + notApplicable === expected) return 'done';
  return 'todo';
}
