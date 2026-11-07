/** Minimal TipTap nodes for the plan documents and the guidance block shapes. */
export type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

/** A paragraph, a bullet list or a numbered list of guidance text. */
export type Block = { p: string } | { bullets: string[] } | { numbered: string[] };

export const heading = (text: string, level = 2): Node => ({
  type: 'heading',
  attrs: { level, textAlign: null },
  content: [{ type: 'text', text }],
});

export const paragraph = (text: string): Node => ({
  type: 'paragraph',
  attrs: { textAlign: null },
  content: [{ type: 'text', text }],
});

const listItems = (items: string[]): Node[] => items.map((t) => ({ type: 'listItem', content: [paragraph(t)] }));

export const bullets = (items: string[]): Node => ({ type: 'bulletList', content: listItems(items) });

export const numbered = (items: string[]): Node => ({
  type: 'orderedList',
  attrs: { start: 1 },
  content: listItems(items),
});

export function renderBlocks(blocks: Block[]): Node[] {
  return blocks.map((b) => {
    if ('p' in b) return paragraph(b.p);
    if ('bullets' in b) return bullets(b.bullets);
    return numbered(b.numbered);
  });
}
