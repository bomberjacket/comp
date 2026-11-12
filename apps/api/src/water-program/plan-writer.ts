import type { PlanAutoKey, PlanFieldDef, PlanPrefillKey, PlanSectionDef } from './plan-sections.generated';
import { PLAN_PROMPT_TEXT } from './water-program.constants';

/** TipTap node as stored in Policy.content (an array of top-level nodes). */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

/** Heading that introduces the utility's own text inside a plan section. */
export const RECORD_HEADING = 'Utility record';
/** Label of the free-text entry that follows the fields. */
export const NOTES_LABEL = 'Additional notes';
/** Top-level sections the writer leaves alone. */
const FIXED_SECTIONS = new Set(['Purpose', 'Source']);

export interface PlanFieldView extends PlanFieldDef {
  value: string;
  /** For an empty prefill box: the list from the platform's records to start from. */
  suggestion?: string;
}

export interface PlanSectionView {
  index: number;
  title: string;
  /** guidance as plain text lines, bullets prefixed with "- " */
  guidance: string[];
  prompts: string[];
  /** One fill-in box per fact the utility supplies. */
  fields: PlanFieldView[];
  /** Free text beyond the fields (also where text written before fields existed lands). */
  notes: string;
  /** Required boxes with a value (boxes the platform fills in always count), and how many are required. */
  filled: number;
  total: number;
  /** Every required box has a value. */
  done: boolean;
}

const nodeText = (n: TipTapNode): string => (n.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : nodeText(c))).join('');
const isHeading = (n: TipTapNode, level: number): boolean => n.type === 'heading' && Number(n.attrs?.level) === level;
const isBold = (n: TipTapNode | undefined): boolean => !!n && n.type === 'text' && (n.marks ?? []).some((m) => m.type === 'bold');

export function paragraph(text: string): TipTapNode {
  return { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text }] };
}
export function heading(text: string, level: number): TipTapNode {
  return { type: 'heading', attrs: { level, textAlign: null }, content: [{ type: 'text', text }] };
}
export function bulletList(items: string[]): TipTapNode {
  return { type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })) };
}
/** "Label: value" with the label in bold; further lines of the value follow as plain paragraphs. */
function labelled(label: string, value: string): TipTapNode[] {
  const [first, ...rest] = value.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return [
    {
      type: 'paragraph',
      attrs: { textAlign: null },
      content: [
        { type: 'text', text: `${label}: `, marks: [{ type: 'bold' }] },
        { type: 'text', text: first ?? '' },
      ],
    },
    ...rest.map(paragraph),
  ];
}

function toLines(n: TipTapNode): string[] {
  if (n.type === 'bulletList' || n.type === 'orderedList') {
    return (n.content ?? []).map((li, i) => `${n.type === 'orderedList' ? `${i + 1}.` : '-'} ${nodeText(li)}`);
  }
  const t = nodeText(n).trim();
  return t ? [t] : [];
}

/** Section boundaries: level-2 headings; the fixed Purpose and Source sections are skipped. */
function sectionRanges(content: TipTapNode[]): Array<{ title: string; start: number; end: number }> {
  const ranges: Array<{ title: string; start: number; end: number }> = [];
  content.forEach((n, i) => {
    if (isHeading(n, 2)) ranges.push({ title: nodeText(n), start: i, end: content.length });
  });
  ranges.forEach((r, i) => {
    r.end = ranges[i + 1]?.start ?? content.length;
  });
  return ranges.filter((r) => !FIXED_SECTIONS.has(r.title));
}

/** Split one section's nodes into guidance, prompt block and the utility's record nodes. */
function splitSection(nodes: TipTapNode[]): { guidance: TipTapNode[]; prompts: string[]; record: TipTapNode[] } {
  const guidance: TipTapNode[] = [];
  const prompts: string[] = [];
  const record: TipTapNode[] = [];
  let mode: 'guidance' | 'prompts' | 'record' = 'guidance';
  for (const n of nodes.slice(1)) {
    if (n.type === 'paragraph' && nodeText(n).trim() === PLAN_PROMPT_TEXT) {
      mode = 'prompts';
      continue;
    }
    if (isHeading(n, 3) && nodeText(n).trim() === RECORD_HEADING) {
      mode = 'record';
      continue;
    }
    if (mode === 'guidance') guidance.push(n);
    else if (mode === 'prompts') prompts.push(...(n.type === 'bulletList' ? toLines(n).map((l) => l.replace(/^- /, '')) : toLines(n)));
    else record.push(n);
  }
  return { guidance, prompts, record };
}

/** Record nodes back into label → value; text under no known label goes to the notes. */
function parseRecord(record: TipTapNode[], labels: Set<string>): { values: Map<string, string>; notes: string } {
  const values = new Map<string, string>();
  const notes: string[] = [];
  let current: string | null = null;
  for (const n of record) {
    const first = n.content?.[0];
    const label = n.type === 'paragraph' && isBold(first) ? (first?.text ?? '').replace(/:\s*$/, '') : null;
    if (label !== null && (labels.has(label) || label === NOTES_LABEL)) {
      current = label;
      const rest = (n.content ?? []).slice(1).map((c) => c.text ?? '').join('').trim();
      if (current === NOTES_LABEL) {
        if (rest) notes.push(rest);
      } else values.set(current, rest);
      continue;
    }
    const lines = toLines(n);
    if (current && current !== NOTES_LABEL) values.set(current, [values.get(current), ...lines].filter(Boolean).join('\n'));
    else notes.push(...lines);
  }
  return { values, notes: notes.join('\n\n').trim() };
}

/** `auto` carries the platform's live values for auto-filled boxes; without it they read from the document. */
export function readPlanSections(
  content: TipTapNode[],
  defs: PlanSectionDef[],
  auto?: Record<PlanAutoKey | PlanPrefillKey, string>,
): PlanSectionView[] {
  return sectionRanges(content).map((r, index) => {
    const { guidance, prompts, record } = splitSection(content.slice(r.start, r.end));
    const def = defs[index];
    const fieldDefs = def?.fields ?? [];
    const { values, notes } = parseRecord(record, new Set(fieldDefs.map((f) => f.label)));
    const fields: PlanFieldView[] = fieldDefs.map((f) => {
      const value = (f.auto && auto ? auto[f.auto] : values.get(f.label)) ?? '';
      const suggestion = f.prefill && auto && !value.trim() ? auto[f.prefill] : '';
      return { ...f, value, ...(suggestion ? { suggestion } : {}) };
    });
    const required = fields.filter((f) => !f.optional);
    const filled = required.filter((f) => f.auto || f.value.trim()).length;
    return {
      index,
      title: r.title,
      guidance: guidance.flatMap(toLines),
      prompts: prompts.length > 0 ? prompts : (def?.prompts ?? []),
      fields,
      notes,
      filled,
      total: required.length,
      done: required.length > 0 ? filled === required.length : notes.length > 0,
    };
  });
}

/**
 * Replace a section's record with the given field values and notes. With any content
 * the prompt block is dropped; with none it is restored from the section definition.
 */
export function writePlanSection(
  content: TipTapNode[],
  index: number,
  input: { values: Record<string, string>; notes: string },
  def: PlanSectionDef,
): TipTapNode[] {
  const ranges = sectionRanges(content);
  const r = ranges[index];
  if (!r) throw new Error(`section ${index} not found`);
  const nodes = content.slice(r.start, r.end);
  const { guidance } = splitSection(nodes);
  const body: TipTapNode[] = def.fields.flatMap((f) => {
    const value = (input.values[f.label] ?? '').trim();
    return value ? labelled(f.label, value) : [];
  });
  const notes = input.notes
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  if (notes.length > 0) body.push(...labelled(NOTES_LABEL, notes[0] as string), ...notes.slice(1).map(paragraph));
  const tail: TipTapNode[] = body.length > 0 ? [heading(RECORD_HEADING, 3), ...body] : [paragraph(PLAN_PROMPT_TEXT), bulletList(def.prompts)];
  return [...content.slice(0, r.start), nodes[0] as TipTapNode, ...guidance, ...tail, ...content.slice(r.end)];
}
