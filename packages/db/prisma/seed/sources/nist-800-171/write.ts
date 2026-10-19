import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GeneratedData, Pair } from './types';

export const SUFFIX = 'nist-800-171';

const PRIMITIVE_FILES: Array<[keyof GeneratedData, string]> = [
  ['families', 'FrameworkEditorFrameworkFamily'],
  ['frameworks', 'FrameworkEditorFramework'],
  ['requirements', 'FrameworkEditorRequirement'],
  ['controls', 'FrameworkEditorControlTemplate'],
  ['policies', 'FrameworkEditorPolicyTemplate'],
  ['tasks', 'FrameworkEditorTaskTemplate'],
  ['policyLinks', 'FrameworkEditorControlPolicyTemplateLink'],
  ['taskLinks', 'FrameworkEditorControlTaskTemplateLink'],
];

const RELATION_FILES: Array<[keyof GeneratedData, string]> = [
  ['controlRequirementPairs', '_FrameworkEditorControlTemplateToFrameworkEditorRequirement'],
  ['controlPolicyPairs', '_FrameworkEditorControlTemplateToFrameworkEditorPolicyTemplate'],
  ['controlTaskPairs', '_FrameworkEditorControlTemplateToFrameworkEditorTaskTemplate'],
];

export interface VersionEntry {
  frameworkId: string;
  version: string;
  releaseNotes: string;
}

function stable(rows: Array<Record<string, unknown>>): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

function byPair(rows: Pair[]): Pair[] {
  return [...rows].sort((a, b) => a.A.localeCompare(b.A) || a.B.localeCompare(b.B));
}

function readPairs(file: string): Pair[] {
  if (!existsSync(file)) return [];
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (p): p is Pair => typeof p === 'object' && p !== null && 'A' in p && 'B' in p,
  );
}

/** Ids of every record in the upstream (non-suffixed) primitives files. */
export function readUpstreamIds(seedDir: string): Set<string> {
  const dir = path.join(seedDir, 'primitives');
  const ids = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file.includes(`.${SUFFIX}.`)) continue;
    const parsed: unknown = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    if (!Array.isArray(parsed)) continue;
    for (const row of parsed) {
      if (
        typeof row === 'object' &&
        row !== null &&
        typeof (row as { id?: unknown }).id === 'string'
      ) {
        ids.add((row as { id: string }).id);
      }
    }
  }
  return ids;
}

/**
 * Writes primitives, relations, unlink deltas and the versions file. Output is
 * deterministic (sorted by id, 2-space, LF) so a second run is byte-identical.
 */
export function writeOutputs(
  seedDir: string,
  data: GeneratedData,
  versions: VersionEntry[],
): string[] {
  const written: string[] = [];
  const primitivesDir = path.join(seedDir, 'primitives');
  const relationsDir = path.join(seedDir, 'relations');
  const versionsDir = path.join(seedDir, 'versions');
  mkdirSync(versionsDir, { recursive: true });

  for (const [key, model] of PRIMITIVE_FILES) {
    const file = path.join(primitivesDir, `${model}.${SUFFIX}.json`);
    const rows = data[key] as Array<{ id: string }>;
    writeFileSync(file, stable(byId(rows) as unknown as Array<Record<string, unknown>>));
    written.push(file);
  }

  for (const [key, model] of RELATION_FILES) {
    const file = path.join(relationsDir, `${model}.${SUFFIX}.json`);
    const unlinkFile = path.join(relationsDir, `${model}.unlink.${SUFFIX}.json`);
    const next = byPair(data[key] as Pair[]);
    const nextKeys = new Set(next.map((p) => `${p.A}|${p.B}`));
    const previous = readPairs(file);
    const removed = previous.filter((p) => !nextKeys.has(`${p.A}|${p.B}`));
    // Carry forward earlier unlinks that are still not re-linked.
    const carried = readPairs(unlinkFile).filter((p) => !nextKeys.has(`${p.A}|${p.B}`));
    const unlink = byPair([...carried, ...removed]).filter(
      (p, i, arr) => i === 0 || `${p.A}|${p.B}` !== `${arr[i - 1]?.A}|${arr[i - 1]?.B}`,
    );
    writeFileSync(file, stable(next as unknown as Array<Record<string, unknown>>));
    written.push(file);
    if (unlink.length > 0) {
      writeFileSync(unlinkFile, stable(unlink as unknown as Array<Record<string, unknown>>));
      written.push(unlinkFile);
    } else if (existsSync(unlinkFile)) {
      rmSync(unlinkFile);
    }
  }

  const versionsFile = path.join(versionsDir, `${SUFFIX}.json`);
  writeFileSync(versionsFile, stable(versions as unknown as Array<Record<string, unknown>>));
  written.push(versionsFile);
  return written;
}
