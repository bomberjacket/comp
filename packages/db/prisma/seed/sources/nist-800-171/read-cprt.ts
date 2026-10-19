import { readFileSync } from 'node:fs';
import type { CprtDoc, CprtElement, CprtRelationship } from './types';

interface CprtExport {
  response: {
    elements: {
      documents: Array<{ doc_identifier: string }>;
      elements: CprtElement[];
      relationships: CprtRelationship[];
    };
  };
}

function isCprtExport(value: unknown): value is CprtExport {
  if (typeof value !== 'object' || value === null) return false;
  const response = (value as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return false;
  const elements = (response as { elements?: unknown }).elements;
  if (typeof elements !== 'object' || elements === null) return false;
  const e = elements as { elements?: unknown; relationships?: unknown };
  return Array.isArray(e.elements) && Array.isArray(e.relationships);
}

/** Loads one CPRT JSON export and indexes elements and projection edges. */
export function readCprt(path: string): CprtDoc {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isCprtExport(parsed)) throw new Error(`Not a CPRT export: ${path}`);
  const { documents, elements, relationships } = parsed.response.elements;
  const byType = new Map<string, CprtElement[]>();
  const byId = new Map<string, CprtElement>();
  for (const el of elements) {
    const list = byType.get(el.element_type) ?? [];
    list.push(el);
    byType.set(el.element_type, list);
    byId.set(el.element_identifier, el);
  }
  const projFrom = new Map<string, string[]>();
  const projTo = new Map<string, string[]>();
  const relsByType = new Map<string, Map<string, string[]>>();
  for (const rel of relationships) {
    const s = rel.source_element_identifier;
    const d = rel.dest_element_identifier;
    const t = rel.relationship_identifier;
    if (t === 'projection') {
      projFrom.set(s, [...(projFrom.get(s) ?? []), d]);
      projTo.set(d, [...(projTo.get(d) ?? []), s]);
      continue;
    }
    const bucket = relsByType.get(t) ?? new Map<string, string[]>();
    bucket.set(s, [...(bucket.get(s) ?? []), d]);
    relsByType.set(t, bucket);
  }
  return {
    docId: documents[0]?.doc_identifier ?? '',
    elements,
    byType,
    byId,
    projFrom,
    projTo,
    relsByType,
  };
}

export function elementsOf(doc: CprtDoc, type: string): CprtElement[] {
  return doc.byType.get(type) ?? [];
}

export function textOf(doc: CprtDoc, id: string): string {
  return (doc.byId.get(id)?.text ?? '').trim();
}

export function titleOf(doc: CprtDoc, id: string): string {
  return (doc.byId.get(id)?.title ?? '').trim();
}

/** Destinations of projection edges from `id` whose identifier starts with `prefix`. */
export function projected(doc: CprtDoc, id: string, prefix: string): string[] {
  return (doc.projFrom.get(id) ?? []).filter((d) => d.startsWith(prefix));
}
