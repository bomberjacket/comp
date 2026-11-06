import type { Department } from './types';

export { joinSections, naturalCompare, sentenceCase, stripTrailingPeriod, truncate } from '../nist-800-171/text';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  bull: '•',
  middot: '·',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  trade: '™',
  reg: '®',
  copy: '©',
  deg: '°',
  frac12: '½',
  times: '×',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

/**
 * CSET stores HTML in most text columns. Keep paragraph and list breaks as newlines,
 * drop everything else, decode entities, and resolve EDM's `[[term|display]]` glossary
 * markup to the display text.
 */
export function cleanText(html: string | null | undefined): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  const decoded = decodeEntities(withBreaks).replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  return decoded
    .replace(/\r/g, '')
    .replace(/^[•·]\s*/gm, '- ')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && (arr[i - 1] ?? '').length > 0))
    .join('\n')
    .replace(/^- *\n+(?=\S)/gm, '- ') // `<li><p>text` leaves the dash on its own line
    .trim();
}

/** First line of cleaned text, for names and one-line summaries. */
export function firstLine(text: string): string {
  return (text.split('\n').find((l) => l.trim().length > 0) ?? '').trim();
}

/** `1. Are services identified?` -> `Are services identified?` (CSET numbers question text). */
export function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*\d+(\.\d+)*[.)]?\s+/, '');
}

/** `Asset Management (AM)` -> `AM - Asset Management`; without an abbreviation the title is used. */
export function familyLabel(title: string, abbreviation: string | null | undefined): string {
  const m = /^(.*?)\s*\(([A-Z0-9-]{1,6})\)\s*$/.exec(title.trim());
  const abbr = abbreviation?.trim() || m?.[2];
  const name = (m?.[1] ?? title).trim();
  return abbr && abbr !== name ? `${abbr} - ${name}` : name;
}

const DEPARTMENT_HINTS: Array<[RegExp, Department]> = [
  [/govern|risk|policy|policies|compliance|dependenc|supply|relationship|service level|anticipate|adapt/i, 'gov'],
  [/training|awareness|education|personnel|people|human/i, 'hr'],
  [/physical|facilit/i, 'admin'],
];

/** A department for a family or category name; falls back to the module default. */
export function departmentFor(name: string, fallback: Department): Department {
  for (const [re, dept] of DEPARTMENT_HINTS) if (re.test(name)) return dept;
  return fallback;
}

/** `[{shortName, section}]` -> `SP 800-53 R5 PM-2; CSF 2.0 GV.RR-02` (deduplicated, in order). */
export function referenceLine(refs: Array<{ title: string | null; shortName: string | null; section: string | null }>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of refs) {
    const doc = (r.shortName ?? r.title ?? '').trim();
    if (!doc) continue;
    const part = r.section?.trim() ? `${doc} ${r.section.trim()}` : doc;
    if (seen.has(part)) continue;
    seen.add(part);
    parts.push(part);
  }
  return parts.join('; ');
}
