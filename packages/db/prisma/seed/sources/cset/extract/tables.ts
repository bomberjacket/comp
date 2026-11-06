/**
 * In-memory copies of the CSET content tables, loaded from `<TABLE>.csv` dumps made
 * by extract/dump-localdb.ps1 against a CSET database. The dump is untrusted data:
 * it is parsed as text and never executed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

/** Tables the exporter reads. dump-localdb.ps1 keeps the same list. */
export const TABLES: readonly string[] = [
  'MATURITY_MODELS',
  'MATURITY_LEVELS',
  'MATURITY_GROUPINGS',
  'MATURITY_QUESTIONS',
  'MATURITY_ANSWER_OPTIONS',
  'MATURITY_QUESTION_PROPS',
  'MATURITY_REFERENCES',
  'MATURITY_REFERENCE_TEXT',
  'MATURITY_SUB_MODEL_QUESTIONS',
  'GEN_FILE',
  'SETS',
  'NEW_REQUIREMENT',
  'REQUIREMENT_SETS',
  'REQUIREMENT_REFERENCES',
  'GALLERY_ITEM',
];

export type Tables = Map<string, Row[]>;

export function emptyTables(): Tables {
  return new Map(TABLES.map((t) => [t, []]));
}

/** Loads every known `<TABLE>.csv` in `dir`; returns the number of rows read. */
export function loadCsvDumps(dir: string, tables: Tables): number {
  if (!existsSync(dir)) throw new Error(`csv dump folder not found: ${dir}`);
  let n = 0;
  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.csv')) continue;
    const rows = tables.get(file.slice(0, -4).toUpperCase());
    if (!rows) continue;
    const records = parseCsv(readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, ''));
    const header = records.shift() ?? [];
    for (const rec of records) {
      const row: Row = {};
      header.forEach((col, i) => {
        const v = rec[i] ?? '';
        row[col] = v === '' ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      });
      rows.push(row);
      n++;
    }
  }
  return n;
}

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '');
}
