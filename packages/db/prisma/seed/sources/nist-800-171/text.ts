import type { FamilyDef, Frequency } from './types';

/** The 17 Rev 3 families; the first 14 are the Rev 2 families in the same order. */
export const FAMILIES: FamilyDef[] = [
  { r3: '03.01', r2: '3.1', code: 'AC', name: 'Access Control', department: 'it' },
  { r3: '03.02', r2: '3.2', code: 'AT', name: 'Awareness and Training', department: 'hr' },
  { r3: '03.03', r2: '3.3', code: 'AU', name: 'Audit and Accountability', department: 'it' },
  { r3: '03.04', r2: '3.4', code: 'CM', name: 'Configuration Management', department: 'it' },
  {
    r3: '03.05',
    r2: '3.5',
    code: 'IA',
    name: 'Identification and Authentication',
    department: 'it',
  },
  { r3: '03.06', r2: '3.6', code: 'IR', name: 'Incident Response', department: 'it' },
  { r3: '03.07', r2: '3.7', code: 'MA', name: 'Maintenance', department: 'it' },
  { r3: '03.08', r2: '3.8', code: 'MP', name: 'Media Protection', department: 'it' },
  { r3: '03.09', r2: '3.9', code: 'PS', name: 'Personnel Security', department: 'hr' },
  { r3: '03.10', r2: '3.10', code: 'PE', name: 'Physical Protection', department: 'admin' },
  { r3: '03.11', r2: '3.11', code: 'RA', name: 'Risk Assessment', department: 'gov' },
  {
    r3: '03.12',
    r2: '3.12',
    code: 'CA',
    name: 'Security Assessment and Monitoring',
    department: 'gov',
  },
  {
    r3: '03.13',
    r2: '3.13',
    code: 'SC',
    name: 'System and Communications Protection',
    department: 'it',
  },
  {
    r3: '03.14',
    r2: '3.14',
    code: 'SI',
    name: 'System and Information Integrity',
    department: 'it',
  },
  { r3: '03.15', r2: null, code: 'PL', name: 'Planning', department: 'gov' },
  { r3: '03.16', r2: null, code: 'SA', name: 'System and Services Acquisition', department: 'it' },
  { r3: '03.17', r2: null, code: 'SR', name: 'Supply Chain Risk Management', department: 'gov' },
];

export function familyByR3(slotOrFamily: string): FamilyDef {
  const key = slotOrFamily.slice(0, 5);
  const fam = FAMILIES.find((f) => f.r3 === key);
  if (!fam) throw new Error(`Unknown Rev 3 family for ${slotOrFamily}`);
  return fam;
}

export function familyByR2(r2Id: string): FamilyDef {
  const key = r2Id.split('.').slice(0, 2).join('.');
  const fam = FAMILIES.find((f) => f.r2 === key);
  if (!fam) throw new Error(`Unknown Rev 2 family for ${r2Id}`);
  return fam;
}

/** `AC - Access Control`, the convention used by upstream's framework import DTO. */
export function familyLabel(fam: FamilyDef, name?: string): string {
  return `${fam.code} - ${name ?? fam.name}`;
}

/** 3.1.14 -> 03.01.14 */
export function padR2(r2Id: string): string {
  return r2Id
    .split('.')
    .map((p) => p.padStart(2, '0'))
    .join('.');
}

/** 03.01.14 -> 3.1.14 */
export function unpadR3(slot: string): string {
  return slot
    .split('.')
    .map((p) => String(Number.parseInt(p, 10)))
    .join('.');
}

export function normalizeIdentifier(raw: string): string {
  return raw.replace(/\s+/g, '').replace('.[', '[');
}

export function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function stripTrailingPeriod(text: string): string {
  return text.trim().replace(/[.;,]+$/, '');
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function joinSections(sections: Array<string | null | undefined>): string {
  return sections
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length > 0)
    .join('\n\n');
}

/** Natural sort for NIST identifiers: splits digits from letters, compares numerically. */
export function naturalCompare(a: string, b: string): number {
  const ta = a.match(/\d+|\D+/g) ?? [a];
  const tb = b.match(/\d+|\D+/g) ?? [b];
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i] ?? '';
    const y = tb[i] ?? '';
    if (x === y) continue;
    const nx = Number.parseInt(x, 10);
    const ny = Number.parseInt(y, 10);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Map BNI's monitoring levels (cmmc-conmon) onto Comp AI's three-level Frequency enum.
 * Finer levels collapse upward; event-driven work is reviewed quarterly.
 */
export function toCompFrequency(level: string): Frequency {
  switch (level.trim().toLowerCase()) {
    case 'continuous':
    case 'daily':
    case 'weekly':
    case 'monthly':
      return 'monthly';
    case 'quarterly':
    case 'bi-annual':
    case 'biannual':
    case 'semi-annual':
    case 'event-driven':
      return 'quarterly';
    case 'annual':
    case 'annually':
    case 'yearly':
      return 'yearly';
    default:
      throw new Error(`Unknown monitoring level: ${level}`);
  }
}

const FREQUENCY_RANK: Record<Frequency, number> = { monthly: 0, quarterly: 1, yearly: 2 };

/** Most common frequency; ties resolve to the more frequent cadence. */
export function dominantFrequency(freqs: Frequency[], fallback: Frequency): Frequency {
  if (freqs.length === 0) return fallback;
  const counts = new Map<Frequency, number>();
  for (const f of freqs) counts.set(f, (counts.get(f) ?? 0) + 1);
  const sorted = [...counts.entries()].sort(
    (x, y) => y[1] - x[1] || FREQUENCY_RANK[x[0]] - FREQUENCY_RANK[y[0]],
  );
  return sorted[0]?.[0] ?? fallback;
}
