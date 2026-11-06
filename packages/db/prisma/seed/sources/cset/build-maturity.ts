import {
  cleanText,
  familyLabel,
  firstLine,
  joinSections,
  referenceLine,
  sentenceCase,
  stripLeadingNumber,
  stripTrailingPeriod,
  truncate,
} from './text';
import type { BuiltRequirement, GroupingJson, MaturityModuleJson, MaturityQuestionJson, ModuleBuild, ModuleDef } from './types';

const bySeq = <T extends { sequence: number | null; id: number }>(a: T, b: T): number =>
  (a.sequence ?? 0) - (b.sequence ?? 0) || a.id - b.id;

/** Grouping chain from the top-level family down to the question's own grouping. */
function chainOf(groupings: Map<number, GroupingJson>, groupingId: number | null): GroupingJson[] {
  const chain: GroupingJson[] = [];
  let cur = groupingId === null ? undefined : groupings.get(groupingId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId === null ? undefined : groupings.get(cur.parentId);
  }
  return chain;
}

/** Document order: groupings by sequence, questions by sequence, children after their parent. */
function orderedQuestions(doc: MaturityModuleJson): MaturityQuestionJson[] {
  const groupings = new Map(doc.groupings.map((g) => [g.id, g]));
  const rank = new Map<number, number[]>();
  for (const g of doc.groupings) rank.set(g.id, chainOf(groupings, g.id).map((x) => x.sequence ?? 0));
  const parents = doc.questions.filter((q) => q.parentQuestionId === null).sort(bySeq);
  const childrenOf = new Map<number, MaturityQuestionJson[]>();
  for (const q of doc.questions) {
    if (q.parentQuestionId === null) continue;
    const list = childrenOf.get(q.parentQuestionId) ?? [];
    list.push(q);
    childrenOf.set(q.parentQuestionId, list);
  }
  const cmp = (a: MaturityQuestionJson, b: MaturityQuestionJson): number => {
    const ra = rank.get(a.groupingId ?? -1) ?? [];
    const rb = rank.get(b.groupingId ?? -1) ?? [];
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const d = (ra[i] ?? -1) - (rb[i] ?? -1);
      if (d !== 0) return d;
    }
    return bySeq(a, b);
  };
  const out: MaturityQuestionJson[] = [];
  for (const p of [...parents].sort(cmp)) {
    out.push(p);
    for (const c of (childrenOf.get(p.id) ?? []).sort(bySeq)) out.push(c);
  }
  return out;
}

function cpgCriteria(guides: string): { it: string; ot: string } {
  const text = cleanText(guides);
  const it = /IT - Implemented\s*([\s\S]*?)(?=OT - Implemented|$)/.exec(text)?.[1]?.trim() ?? '';
  const ot = /OT - Implemented\s*([\s\S]*?)(?=IT - Implemented|$)/.exec(text)?.[1]?.trim() ?? '';
  return { it, ot };
}

/**
 * `AM: Goal 1 - Services are identified and prioritized` for CRR/IMR/EDM (family code
 * first), `Dynamic Reconfiguration (Adaptive Response)` for MVRA's three-level tree,
 * `Robust Data Backup (DB)` for RRA's single family.
 */
function controlName(chain: GroupingJson[], label: string): string {
  const titles = chain.slice(1).map((g) => stripTrailingPeriod(cleanText(g.title)));
  const last = titles[titles.length - 1] ?? '';
  const middle = titles.slice(0, -1);
  const code = label.includes(' - ') ? (label.split(' - ')[0] as string) : null;
  const tail = middle.length ? ` (${middle.join(' / ')})` : '';
  return code ? `${code}: ${last}${tail}` : `${last}${tail}`;
}

function questionText(q: MaturityQuestionJson): string {
  return cleanText(q.text) || cleanText(q.securityPractice) || q.title;
}

function levelName(doc: MaturityModuleJson, levelId: number | null): string | null {
  if (levelId === null || doc.levels.length <= 1) return null;
  const level = doc.levels.find((l) => l.id === levelId);
  return level && level.name !== 'All Levels' ? level.name : null;
}

function describe(module: ModuleDef, doc: MaturityModuleJson, q: MaturityQuestionJson, chain: GroupingJson[], parent?: MaturityQuestionJson): string {
  const text = questionText(q);
  const sections: Array<string | null> = [];
  if (module.key === 'cpg2') {
    const criteria = cpgCriteria(q.implementationGuides ?? '');
    sections.push(
      `Goal ${q.title}: ${cleanText(q.securityPractice)}`,
      q.outcome ? `Outcome: ${cleanText(q.outcome)}` : null,
      q.scope ? `Scope: ${cleanText(q.scope)}` : null,
      q.riskAddressed ? `Risk addressed: ${cleanText(q.riskAddressed)}` : null,
      q.recommendAction ? `Recommended action: ${cleanText(q.recommendAction)}` : null,
      criteria.it ? `IT implementation criteria (answer Yes only when every bullet is met): ${criteria.it}` : null,
      criteria.ot ? `OT implementation criteria (answer Yes only when every bullet is met): ${criteria.ot}` : null,
      Object.keys(q.props).length
        ? `Cost ${q.props.COST ?? '?'} of 3, impact ${(q.props.IMPACT ?? '?').toLowerCase()}, complexity ${(q.props.COMPLEXITY ?? '?').toLowerCase()}.`
        : null,
      q.services ? `Free CISA services: ${cleanText(q.services)}` : null,
    );
  } else {
    sections.push(
      parent ? `${parent.title}: ${stripLeadingNumber(questionText(parent))}` : null,
      `${q.title}: ${stripLeadingNumber(text)}`,
      q.supplemental ? `Guidance: ${cleanText(q.supplemental)}` : null,
    );
    const level = levelName(doc, q.levelId);
    if (level) sections.push(`Tier: ${level}.`);
    if (q.options.length)
      sections.push(`Detail options (select all that apply): ${q.options.map((o) => cleanText(o.text)).join('; ')}`);
  }
  const refs = referenceLine(q.references);
  if (refs) sections.push(`References: ${refs}.`);
  for (const t of q.referenceText) sections.push(cleanText(t));
  sections.push(`Family: ${chain.map((g) => cleanText(g.title)).join(' > ')}.`, `Source: ${module.attribution}.`);
  return joinSections(sections);
}

/**
 * Requirement rows are the answerable questions. CPG 2.0's IT and OT child rows are not
 * questions but answer slots, so they are folded into the goal (the answer layer records
 * the domain). CRR/EDM sub-questions (`AM:G2.Q1-P`) are real practices and stay.
 * Control = the question's own grouping when it has a parent (a goal), else the question.
 */
export function buildMaturity(module: ModuleDef, doc: MaturityModuleJson): ModuleBuild {
  const groupings = new Map(doc.groupings.map((g) => [g.id, g]));
  const byId = new Map(doc.questions.map((q) => [q.id, q]));
  const families = new Map<string, string>();
  const requirements: BuiltRequirement[] = [];
  const seen = new Set<string>();

  for (const q of orderedQuestions(doc)) {
    if (module.domainMode === 'it_ot' && q.parentQuestionId !== null) continue;
    const chain = chainOf(groupings, q.groupingId);
    const top = chain[0];
    if (!top) throw new Error(`${module.key}: question ${q.title} has no grouping`);
    const familyKey = String(top.id);
    const label = familyLabel(cleanText(top.title), top.abbreviation);
    families.set(familyKey, label);
    const own = chain[chain.length - 1] as GroupingJson;
    const goal = chain.length > 1 ? own : null;
    // Goal abbreviations repeat across domains (IMR: G1..G5), so the key is the whole path.
    const controlKey = goal ? `g:${chain.map((g) => g.abbreviation?.trim() || String(g.id)).join('/')}` : `q:${q.title}`;
    const identifier = q.title.trim();
    if (!identifier || seen.has(identifier)) throw new Error(`${module.key}: duplicate or empty identifier ${identifier} (question ${q.id})`);
    seen.add(identifier);
    const parent = q.parentQuestionId === null ? undefined : byId.get(q.parentQuestionId);
    const text = stripLeadingNumber(questionText(q));
    // CRR/EDM sub-questions are bare facets ("1.3 Technology"); name them with their parent.
    const named = parent ? `${firstLine(stripLeadingNumber(questionText(parent)))} (${firstLine(text)})` : firstLine(text);
    const name = truncate(sentenceCase(stripTrailingPeriod(named)), 200);
    const goalTitle = goal ? stripTrailingPeriod(cleanText(goal.title)) : cleanText(q.securityPractice) || name;
    requirements.push({
      identifier,
      name,
      description: describe(module, doc, q, chain, parent),
      familyLabel: label,
      familyKey,
      controlKey,
      controlName: goal ? controlName(chain, label) : `${identifier} ${goalTitle}`,
      controlDescription: goal
        ? `${goalTitle}. Practices: see the requirements linked to this control. Family: ${label}.`
        : `${q.title} ${goalTitle}: ${cleanText(q.outcome) || name}`,
      summary: `${identifier} ${name}`,
    });
  }
  return { module, requirements, families };
}
