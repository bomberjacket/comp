/**
 * Artifact categories for evidence tasks.
 *
 * NIST SP 800-171A lists, per security requirement, the objects an assessor may examine
 * and the mechanisms or processes they may test. Each object is sorted into one of four
 * artifact categories (BNI's evidence model): policy, procedure / SOP, configuration
 * evidence, operational evidence. The result is written into every objective task so the
 * person collecting evidence knows what kind of artifact satisfies it.
 */
import { writeFileSync } from 'node:fs';

export type ArtifactCategory = 'policy' | 'sop' | 'config' | 'ops';

export const CATEGORY_LABEL: Record<ArtifactCategory, string> = {
  policy: 'Policy',
  sop: 'Procedure / SOP',
  config: 'Configuration evidence',
  ops: 'Operational evidence',
};

const CATEGORY_ORDER: ArtifactCategory[] = ['policy', 'sop', 'config', 'ops'];

const GENERIC = /^(other relevant documents?( (or|and) records)?|records)$/;

const DOC_END =
  /(plan|plans|procedures?|agreements?|rules of behavior|guidelines?|standards?|curriculum|training materials|checklists?|strategy|contracts?|statement of work|codes? of federal regulations|terms and conditions)$/;
const PROC =
  /\b(procedures?|plan\b|plans\b|rules of behavior|agreements?|training (materials|curriculum)|checklist|guidelines?|standards?|requirements? for|criteria|strategy|contract|statement of work|codes? of federal regulations)/;
const OPS =
  /\b(records?|logs?|reports?|list of|lists? of|inventory|inventories|results|reviews?|notifications?|alerts?|minutes|tickets?|evidence of|assessments?|audit|monitoring|history|approvals?|authorizations?|certificat|exercise|test results|screening|access authorization)/;
const CONFIG =
  /\b(configuration|settings|design documentation|architecture|mechanisms?|baseline|cryptograph|boundary|firewall|components?|diagram|topology|hardware|software|tools?|automated)/;

/** Split a `[SELECT FROM: a; b; c]` list into normalized phrases. */
export function splitObjects(raw: string): string[] {
  const inner = raw.replace(/SELECT FROM:/gi, '').replace(/[[\]]/g, '');
  const out: string[] = [];
  for (const part of inner.split(';')) {
    const s = part.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '').trim().toLowerCase();
    if (s && !GENERIC.test(s)) out.push(s);
  }
  return out;
}

/**
 * Policies and procedure-type documents are decided first; only live system output is
 * classified as configuration or operational evidence. Test objects are mechanisms
 * (configuration) or organizational processes (operational).
 */
export function classify(item: string, source: 'examine' | 'test'): ArtifactCategory[] {
  if (/^(mechanisms|automated mechanisms|system mechanisms)/.test(item)) return ['config'];
  if (/^(organizational processes?|processes for)/.test(item)) return ['ops'];
  if (item.includes('policy and procedures') || item.includes('policies and procedures')) {
    return ['policy', 'sop'];
  }
  if (/\bpolic(y|ies)$/.test(item)) return ['policy'];
  if (item.startsWith('procedures') || DOC_END.test(item) || PROC.test(item)) return ['sop'];
  if (source === 'test') return ['config'];
  if (OPS.test(item)) return ['ops'];
  if (CONFIG.test(item)) return ['config'];
  return ['ops'];
}

export type ArtifactBuckets = Record<ArtifactCategory, string[]>;

/** Group a requirement's examine and test objects by artifact category (sorted, unique). */
export function bucketArtifacts(examine: string, test: string): ArtifactBuckets {
  const sets: Record<ArtifactCategory, Set<string>> = {
    policy: new Set(),
    sop: new Set(),
    config: new Set(),
    ops: new Set(),
  };
  for (const item of splitObjects(examine)) {
    for (const cat of classify(item, 'examine')) sets[cat].add(item);
  }
  for (const item of splitObjects(test)) {
    for (const cat of classify(item, 'test')) sets[cat].add(item);
  }
  const out = {} as ArtifactBuckets;
  for (const cat of CATEGORY_ORDER) out[cat] = [...sets[cat]].sort();
  return out;
}

/** The "what to collect" section of an objective task description. */
export function artifactSection(buckets: ArtifactBuckets): string {
  const lines = CATEGORY_ORDER.filter((c) => buckets[c].length > 0).map(
    (c) => `- ${CATEGORY_LABEL[c]}: ${buckets[c].join('; ')}`,
  );
  if (lines.length === 0) return '';
  return `Artifacts that satisfy this objective (from NIST SP 800-171A), by category:\n${lines.join('\n')}`;
}

export interface ArtifactListRow {
  revision: 'r2' | 'r3';
  family: string;
  requirement: string;
  objective: string;
  objectiveText: string;
  frequency: string;
  buckets: ArtifactBuckets;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Reference master artifact list, one row per assessment objective. */
export function writeArtifactList(file: string, rows: ArtifactListRow[]): void {
  const header = [
    'revision',
    'family',
    'requirement',
    'objective',
    'objective_text',
    'frequency',
    'policy',
    'procedure_sop',
    'configuration_evidence',
    'operational_evidence',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.revision,
        r.family,
        r.requirement,
        r.objective,
        r.objectiveText,
        r.frequency,
        r.buckets.policy.join('; '),
        r.buckets.sop.join('; '),
        r.buckets.config.join('; '),
        r.buckets.ops.join('; '),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  writeFileSync(file, `${lines.join('\n')}\n`);
}
