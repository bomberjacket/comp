import { readFileSync } from 'node:fs';
import { normalizeIdentifier } from './text';
import type { ChangeRow, FrequencyRow, Rev2Objective, Rev2Requirement } from './types';

/** Minimal RFC 4180 parser (quoted fields, embedded newlines, doubled quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

export function readCsvFile(path: string): string[][] {
  return parseCsv(readFileSync(path, 'utf8'));
}

const R2_REQ = /^3\.\d+\.\d+$/;

/**
 * Reads the official SP 800-171A (Rev 2) assessment-procedure table exported to CSV.
 * Columns: Family, Identifier, Sort-As, Security Requirement, Assessment Objective,
 * Examine, Interview, Test. Header rows carry the requirement; bracketed rows carry
 * objectives; 23 single-objective requirements carry their statement on the header row.
 */
export function readRev2Workbook(path: string): {
  requirements: Rev2Requirement[];
  objectives: Rev2Objective[];
} {
  const rows = readCsvFile(path).slice(1);
  const requirements: Rev2Requirement[] = [];
  const objectives: Rev2Objective[] = [];
  const kids = new Map<string, number>();
  for (const r of rows) {
    const id = normalizeIdentifier(r[1] ?? '');
    if (id.includes('[')) {
      const parent = id.slice(0, id.indexOf('['));
      kids.set(parent, (kids.get(parent) ?? 0) + 1);
    }
  }
  const seqByParent = new Map<string, number>();
  for (const r of rows) {
    const id = normalizeIdentifier(r[1] ?? '');
    if (R2_REQ.test(id)) {
      requirements.push({
        id,
        familyName: (r[0] ?? '').trim(),
        sortAs: (r[2] ?? '').trim(),
        text: (r[3] ?? '').trim(),
        examine: (r[5] ?? '').trim(),
        interview: (r[6] ?? '').trim(),
        test: (r[7] ?? '').trim(),
      });
      const objectiveCell = (r[4] ?? '').trim();
      const isSolo = (kids.get(id) ?? 0) === 0 && !/^determine if:?$/i.test(objectiveCell);
      if (isSolo) {
        objectives.push({
          identifier: `${id}[a]`,
          requirementId: id,
          text: objectiveCell.replace(/^determine if:?\s*/i, ''),
          solo: true,
          seq: 1,
        });
      }
      continue;
    }
    if (id.includes('[')) {
      const parent = id.slice(0, id.indexOf('['));
      const seq = (seqByParent.get(parent) ?? 0) + 1;
      seqByParent.set(parent, seq);
      objectives.push({
        identifier: id,
        requirementId: parent,
        text: (r[4] ?? '').trim(),
        solo: false,
        seq,
      });
    }
  }
  return { requirements, objectives };
}

/** NIST "Change Analysis 800-171 R2-R3" sheet exported to CSV (16 columns). */
export function readChangeAnalysis(path: string): Map<string, ChangeRow> {
  const rows = readCsvFile(path);
  const header = rows[0] ?? [];
  const flagNames = header.slice(9, 15).map((h) => h.replace(/\s+/g, ' ').trim());
  const out = new Map<string, ChangeRow>();
  for (const r of rows.slice(1)) {
    const r2Id = normalizeIdentifier(r[2] ?? '');
    const r3Id = (r[6] ?? '').trim();
    const flags = flagNames.filter((_, i) => (r[9 + i] ?? '').trim().toUpperCase() === 'X');
    const row: ChangeRow = {
      r2Id,
      r3Id,
      name: (r[7] ?? '').trim(),
      flags,
      summary: (r[15] ?? '').replace(/\s*\n\s*/g, '; ').trim(),
    };
    if (r2Id) out.set(r2Id, row);
    else if (r3Id) out.set(`r3:${r3Id}`, row);
  }
  return out;
}

/** `frequencies.csv` exported from cmmc-conmon: objective_id, frequency, rationale. */
export function readFrequencies(path: string): Map<string, FrequencyRow> {
  const rows = readCsvFile(path).slice(1);
  const out = new Map<string, FrequencyRow>();
  for (const r of rows) {
    const objectiveId = normalizeIdentifier(r[0] ?? '');
    if (!objectiveId) continue;
    out.set(objectiveId, {
      objectiveId,
      frequency: (r[1] ?? '').trim(),
      rationale: (r[2] ?? '').trim(),
    });
  }
  return out;
}

/** Optional `objective-overrides.csv`: r2_objective, r3_control. */
export function readOverrides(path: string): Map<string, string> {
  const out = new Map<string, string>();
  let rows: string[][];
  try {
    rows = readCsvFile(path).slice(1);
  } catch {
    return out;
  }
  for (const r of rows) {
    const obj = normalizeIdentifier(r[0] ?? '');
    const ctl = (r[1] ?? '').trim();
    if (obj && ctl) out.set(obj, ctl);
  }
  return out;
}
