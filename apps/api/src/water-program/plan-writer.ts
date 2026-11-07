import { PLAN_PROMPT_TEXT } from './water-program.constants';

/** TipTap node as stored in Policy.content (an array of top-level nodes). */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

/** Heading that introduces the utility's own text inside a plan section. */
export const RECORD_HEADING = 'Utility record';
/** Top-level sections the writer leaves alone. */
const FIXED_SECTIONS = new Set(['Purpose', 'Source']);

export interface PlanSectionView {
  index: number;
  title: string;
  /** guidance as plain text lines, bullets prefixed with "- " */
  guidance: string[];
  prompts: string[];
  record: string;
  done: boolean;
}

const nodeText = (n: TipTapNode): string => (n.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : nodeText(c))).join('');
const isHeading = (n: TipTapNode, level: number): boolean => n.type === 'heading' && Number(n.attrs?.level) === level;

export function paragraph(text: string): TipTapNode {
  return { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text }] };
}
export function heading(text: string, level: number): TipTapNode {
  return { type: 'heading', attrs: { level, textAlign: null }, content: [{ type: 'text', text }] };
}
export function bulletList(items: string[]): TipTapNode {
  return { type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })) };
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

/** Split one section's nodes into guidance, prompt block and the utility's record. */
function splitSection(nodes: TipTapNode[]): { guidance: TipTapNode[]; prompts: string[]; record: string[] } {
  const guidance: TipTapNode[] = [];
  const prompts: string[] = [];
  const record: string[] = [];
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
    else record.push(...toLines(n));
  }
  return { guidance, prompts, record };
}

export function readPlanSections(content: TipTapNode[], fallbackPrompts: string[][]): PlanSectionView[] {
  return sectionRanges(content).map((r, index) => {
    const { guidance, prompts, record } = splitSection(content.slice(r.start, r.end));
    const text = record.join('\n\n').trim();
    return {
      index,
      title: r.title,
      guidance: guidance.flatMap(toLines),
      prompts: prompts.length > 0 ? prompts : (fallbackPrompts[index] ?? []),
      record: text,
      done: text.length > 0,
    };
  });
}

/**
 * Replace a section's record with `text` (blank lines separate paragraphs). With text
 * the prompt block is dropped; without it the prompt block is restored from `prompts`.
 */
export function writePlanSection(content: TipTapNode[], index: number, text: string, prompts: string[]): TipTapNode[] {
  const ranges = sectionRanges(content);
  const r = ranges[index];
  if (!r) throw new Error(`section ${index} not found`);
  const nodes = content.slice(r.start, r.end);
  const { guidance } = splitSection(nodes);
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  const tail: TipTapNode[] =
    paragraphs.length > 0
      ? [heading(RECORD_HEADING, 3), ...paragraphs.map(paragraph)]
      : [paragraph(PLAN_PROMPT_TEXT), bulletList(prompts)];
  return [...content.slice(0, r.start), nodes[0] as TipTapNode, ...guidance, ...tail, ...content.slice(r.end)];
}
