import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Every file read the Linux checks make goes through here so the tests can
 * replace the filesystem with a map and so a permission problem is reported
 * instead of thrown.
 */
export interface ReadResult {
  text: string | null;
  error: string | null;
}

export function readText(file: string): ReadResult {
  try {
    return { text: readFileSync(file, 'utf-8'), error: null };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === 'ENOENT') return { text: null, error: null };
    return { text: null, error: `${e.code ?? 'ERR'}: ${file}` };
  }
}

/** Files in a directory with one of the given suffixes, sorted, full paths. */
export function listFiles(dir: string, suffixes: string[]): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => suffixes.some((s) => f.endsWith(s)))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** Concatenate a main file and a drop-in directory, in that order. */
export function readConfigSet(main: string | null, dropInDir: string | null, suffixes: string[]) {
  const files = [...(main ? [main] : []), ...(dropInDir ? listFiles(dropInDir, suffixes) : [])];
  const parts: string[] = [];
  const errors: string[] = [];
  const read: string[] = [];
  for (const f of files) {
    const r = readText(f);
    if (r.text !== null) {
      parts.push(r.text);
      read.push(f);
    } else if (r.error) errors.push(r.error);
  }
  return { text: parts.join('\n'), files: read, errors };
}

export function fileExists(file: string): boolean {
  try {
    return existsSync(file);
  } catch {
    return false;
  }
}

/** Modification time in epoch milliseconds, or null when absent or unreadable. */
export function fileMtime(file: string): number | null {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}
