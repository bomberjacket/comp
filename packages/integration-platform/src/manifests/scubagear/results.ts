import type { CheckContext } from '../../types';
import {
  SCUBA_COMPACT_FORMAT,
  type ScubaCompactPolicy,
  type ScubaCompactResults,
  type ScubaRawControl,
  type ScubaRawResults,
} from './types';

/** Credential field that carries the (compacted) ScubaResults JSON. */
export const SCUBA_RESULTS_FIELD = 'scubaResults';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

const INDICATORS = /<div class=['"]policy-indicators['"]>[\s\S]*?<\/div>/gi;

/** Indicator badge titles ScubaGear attaches to a requirement (BOD 25-01, Manual, ...). */
export function indicatorsOf(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/class=['"]indicator[^'"]*['"][^>]*title=['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Remove ScubaGear's report HTML (indicator badges, links, line breaks). */
export function stripHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(INDICATORS, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, name: string) => ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** `MS.AAD.3.2v2` -> `MS.AAD.3.2` */
export function policyBaseId(id: string): string {
  return id.replace(/v\d+$/i, '');
}

function normalizeCriticality(raw: string): { criticality: 'Shall' | 'Should'; manual: boolean } {
  const lower = raw.toLowerCase();
  return {
    criticality: lower.startsWith('should') ? 'Should' : 'Shall',
    manual: lower.includes('not-implemented'),
  };
}

function isMeaningful(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'N/A';
}

function commentsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((c): c is string => typeof c === 'string');
  return typeof value === 'string' && value.trim() ? [value] : [];
}

function compactControl(product: string, groupNumber: string, groupName: string, c: ScubaRawControl): ScubaCompactPolicy {
  const { criticality, manual } = normalizeCriticality(String(c.Criticality ?? ''));
  const policy: ScubaCompactPolicy = {
    id: String(c['Control ID']),
    product,
    groupNumber,
    groupName,
    requirement: stripHtml(c.Requirement),
    result: String(c.Result ?? ''),
    criticality,
    manual,
    bod2501: indicatorsOf(c.Requirement).some((t) => t.startsWith('BOD 25-01')),
    details: stripHtml(c.Details),
    comments: commentsOf(c.Comments),
  };
  if (isMeaningful(c.OmittedEvaluationResult)) {
    policy.omitted = { result: c.OmittedEvaluationResult, details: stripHtml(c.OmittedEvaluationDetails) };
  }
  if (c.IncorrectResult === true || c.IncorrectResult === 'True' || c.IncorrectResult === 'true') {
    policy.incorrect = {
      details: stripHtml(c.IncorrectResultDetails),
      originalResult: String(c.OriginalResult ?? ''),
    };
  }
  return policy;
}

/**
 * Validate a ScubaResults file and reduce it to what the checks need: run
 * metadata, per-product summary and one row per policy. `Raw` (the provider
 * settings export, most of the file) is dropped.
 */
export function compactScubaResults(input: unknown): ScubaCompactResults {
  if (!input || typeof input !== 'object') throw new Error('ScubaGear results must be a JSON object');
  const raw = input as Partial<ScubaRawResults>;
  if (!raw.MetaData || typeof raw.MetaData !== 'object') throw new Error('Missing MetaData: not a ScubaResults file');
  if (raw.MetaData.Tool && raw.MetaData.Tool !== 'ScubaGear') {
    throw new Error(`Unsupported tool "${raw.MetaData.Tool}" (expected ScubaGear)`);
  }
  if (!raw.Results || typeof raw.Results !== 'object') throw new Error('Missing Results: not a ScubaResults file');

  const policies: ScubaCompactPolicy[] = [];
  for (const [product, groups] of Object.entries(raw.Results)) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      for (const c of g.Controls ?? []) {
        if (!c || typeof c['Control ID'] !== 'string') continue;
        policies.push(compactControl(product, String(g.GroupNumber ?? ''), String(g.GroupName ?? ''), c));
      }
    }
  }
  if (policies.length === 0) throw new Error('No policy results found in the file');

  const m = raw.MetaData;
  return {
    format: SCUBA_COMPACT_FORMAT,
    meta: {
      tenantId: m.TenantId ?? '',
      displayName: m.DisplayName ?? '',
      domainName: m.DomainName ?? '',
      tool: m.Tool ?? 'ScubaGear',
      toolVersion: m.ToolVersion ?? '',
      timestamp: m.TimestampZulu ?? '',
      reportId: m.ReportUUID ?? '',
      productsAssessed: Array.isArray(m.ProductsAssessed) ? m.ProductsAssessed : [],
    },
    summary: raw.Summary ?? {},
    policies,
  };
}

/** Accept either the compact form or a raw ScubaResults file. */
export function parseStoredResults(text: string): ScubaCompactResults {
  const parsed: unknown = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && (parsed as { format?: string }).format === SCUBA_COMPACT_FORMAT) {
    return parsed as ScubaCompactResults;
  }
  return compactScubaResults(parsed);
}

/**
 * The results stored on the connection, or null (with a log line) when none
 * were uploaded yet or the stored text is unreadable.
 */
export function readStoredResults(ctx: CheckContext): ScubaCompactResults | null {
  const stored = ctx.credentials[SCUBA_RESULTS_FIELD];
  const text = Array.isArray(stored) ? stored.join('') : stored;
  if (!text || !text.trim()) {
    ctx.warn('No ScubaGear results uploaded for this connection yet');
    return null;
  }
  try {
    return parseStoredResults(text);
  } catch (err) {
    ctx.error('Stored ScubaGear results could not be parsed', { error: String(err) });
    return null;
  }
}

/** Whole days between the report timestamp and now (Infinity when unknown). */
export function reportAgeDays(results: ScubaCompactResults, now = Date.now()): number {
  const t = Date.parse(results.meta.timestamp);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((now - t) / 86_400_000);
}

/** Find a policy by exact id, falling back to the versionless id. */
export function findPolicy(results: ScubaCompactResults, id: string): ScubaCompactPolicy | undefined {
  const base = policyBaseId(id);
  return results.policies.find((p) => p.id === id) ?? results.policies.find((p) => policyBaseId(p.id) === base);
}
