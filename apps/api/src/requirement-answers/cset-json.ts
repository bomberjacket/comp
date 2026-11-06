/**
 * Round trip with CSET's assessment JSON export (`GET api/assessment/export/json`,
 * `AssessmentExportPayload`). Pure functions; the service supplies the requirement
 * list and stores what comes back.
 */
import {
  CSET_CODE_TO_VALUE,
  VALUE_TO_CSET_CODE,
  type AnswerDomain,
  type AnswerValue,
} from './results';

export interface CsetQuestion {
  questionId?: number;
  title?: string | null;
  questionText?: string | null;
  answerText?: string | null;
  comment?: string | null;
  followupQuestions?: CsetQuestion[] | null;
}
export interface CsetGrouping {
  groupingId?: number;
  title?: string | null;
  groupings?: CsetGrouping[] | null;
  questions?: CsetQuestion[] | null;
}
export interface CsetModel {
  modelId?: number;
  modelName?: string | null;
  groupings?: CsetGrouping[] | null;
}
export interface CsetRequirement {
  requirementId?: number;
  title?: string | null;
  requirementText?: string | null;
  answerText?: string | null;
  comment?: string | null;
}
export interface CsetPayload {
  assessment?: { name?: string | null; assessmentDate?: string | null } | null;
  standards?: { standards?: { setName?: string | null; requirements?: CsetRequirement[] | null }[] | null } | null;
  maturityModels?: CsetModel[] | null;
}

export interface ImportedAnswer {
  requirementId: string;
  identifier: string;
  domain: AnswerDomain;
  answer: AnswerValue;
  comment: string | null;
}

export interface ImportResult {
  answers: ImportedAnswer[];
  /** CSET items with an answer whose identifier is not in this framework */
  unmatched: string[];
  /** CSET items seen (answered or not) */
  seen: number;
}

function toValue(code: string | null | undefined): AnswerValue | null {
  const c = (code ?? '').trim().toUpperCase();
  return CSET_CODE_TO_VALUE[c] ?? null;
}

function domainOfChild(text: string | null | undefined): AnswerDomain | null {
  const t = text ?? '';
  if (/\(IT\)|information technology/i.test(t)) return 'it';
  if (/\(OT\)|operational technology/i.test(t)) return 'ot';
  return null;
}

function* walk(groupings: CsetGrouping[] | null | undefined): Generator<CsetQuestion> {
  for (const g of groupings ?? []) {
    for (const q of g.questions ?? []) yield q;
    yield* walk(g.groupings);
  }
}

/**
 * Matches CSET questions and requirements to this framework's requirements by CSET
 * title (`1.A`, `EH:G1.Q1`, `1.S.A.1`). CPG 2.0's IT/OT follow-up rows become `it` /
 * `ot` answers on the goal; everything else is domain `all`.
 */
export function importFromCset(
  payload: CsetPayload,
  requirements: { id: string; identifier: string }[],
  domainMode: 'single' | 'it_ot',
): ImportResult {
  const byIdentifier = new Map(requirements.map((r) => [r.identifier.trim(), r.id]));
  const answers: ImportedAnswer[] = [];
  const unmatched: string[] = [];
  let seen = 0;

  const take = (
    identifier: string | null | undefined,
    code: string | null | undefined,
    comment: string | null | undefined,
    domain: AnswerDomain,
  ): void => {
    const ident = (identifier ?? '').trim();
    if (!ident) return;
    seen++;
    const value = toValue(code);
    if (!value) return;
    const requirementId = byIdentifier.get(ident);
    if (!requirementId) {
      unmatched.push(ident);
      return;
    }
    answers.push({ requirementId, identifier: ident, domain, answer: value, comment: comment?.trim() || null });
  };

  for (const model of payload.maturityModels ?? []) {
    for (const q of walk(model.groupings)) {
      if (domainMode === 'it_ot') {
        for (const child of q.followupQuestions ?? []) {
          const domain = domainOfChild(child.questionText);
          if (domain) take(q.title, child.answerText, child.comment ?? q.comment, domain);
        }
        if (!(q.followupQuestions ?? []).some((c) => domainOfChild(c.questionText)))
          take(q.title, q.answerText, q.comment, 'it');
      } else {
        take(q.title, q.answerText, q.comment, 'all');
        for (const child of q.followupQuestions ?? []) take(child.title, child.answerText, child.comment, 'all');
      }
    }
  }
  for (const set of payload.standards?.standards ?? []) {
    for (const r of set.requirements ?? []) take(r.title, r.answerText, r.comment, 'all');
  }
  return { answers, unmatched: [...new Set(unmatched)], seen };
}

export interface ExportInput {
  frameworkName: string;
  modelName: string;
  kind: 'maturity' | 'standard';
  domainMode: 'single' | 'it_ot';
  requirements: { id: string; identifier: string; name: string; family: string | null }[];
  answers: { requirementId: string; domain: AnswerDomain; answer: AnswerValue; comment: string | null }[];
}

/** The same shape CSET exports, so a file written here can be read back by `importFromCset`. */
export function exportToCset(input: ExportInput): CsetPayload {
  const byReq = new Map<string, Map<AnswerDomain, { answer: AnswerValue; comment: string | null }>>();
  for (const a of input.answers) {
    const m = byReq.get(a.requirementId) ?? new Map();
    m.set(a.domain, { answer: a.answer, comment: a.comment });
    byReq.set(a.requirementId, m);
  }
  const code = (v: AnswerValue | undefined): string => (v ? VALUE_TO_CSET_CODE[v] : 'U');

  if (input.kind === 'standard') {
    return {
      assessment: { name: input.frameworkName },
      standards: {
        standards: [
          {
            setName: input.modelName,
            requirements: input.requirements.map((r) => ({
              title: r.identifier,
              requirementText: r.name,
              answerText: code(byReq.get(r.id)?.get('all')?.answer),
              comment: byReq.get(r.id)?.get('all')?.comment ?? null,
            })),
          },
        ],
      },
    };
  }

  const groups = new Map<string, CsetQuestion[]>();
  for (const r of input.requirements) {
    const fam = r.family ?? 'Other';
    const list = groups.get(fam) ?? [];
    const per = byReq.get(r.id);
    const q: CsetQuestion = { title: r.identifier, questionText: r.name };
    if (input.domainMode === 'it_ot') {
      q.followupQuestions = [
        { title: '', questionText: 'Information Technology (IT)', answerText: code(per?.get('it')?.answer), comment: per?.get('it')?.comment ?? null },
        { title: '', questionText: 'Operational Technology (OT)', answerText: code(per?.get('ot')?.answer), comment: per?.get('ot')?.comment ?? null },
      ];
    } else {
      q.answerText = code(per?.get('all')?.answer);
      q.comment = per?.get('all')?.comment ?? null;
    }
    list.push(q);
    groups.set(fam, list);
  }
  return {
    assessment: { name: input.frameworkName },
    maturityModels: [
      {
        modelName: input.modelName,
        groupings: [...groups.entries()].map(([title, questions]) => ({ title, questions })),
      },
    ],
  };
}
