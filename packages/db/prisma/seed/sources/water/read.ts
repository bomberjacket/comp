import { readFileSync } from 'node:fs';
import type { Cpg2Goal, CpgPractice, CrosswalkRow, InterviewQuestion, WcatJson } from './types';

/** Minimal RFC 4180 reader (quoted fields, doubled quotes, LF or CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function csvObjects(file: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!header) throw new Error(`${file}: empty`);
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function readWcat(file: string): WcatJson {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as WcatJson;
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) throw new Error(`${file}: no items`);
  return parsed;
}

export function readCpgPractices(file: string): Map<string, CpgPractice> {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { practices: CpgPractice[] };
  return new Map(parsed.practices.map((p) => [p.id, p]));
}

export function readCrosswalk(file: string): Map<string, CrosswalkRow> {
  const rows = csvObjects(file).map((r) => ({
    wcatId: r.wcatId ?? '',
    cpg2Goal: r.cpg2Goal ?? '',
    secondaryGoals: (r.secondaryGoals ?? '')
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    note: r.note ?? '',
  }));
  return new Map(rows.map((r) => [r.wcatId, r]));
}

export function readInterviewQuestions(file: string): InterviewQuestion[] {
  return csvObjects(file).map((r) => ({
    cpg2Goal: r.cpg2Goal ?? '',
    section: r.section ?? '',
    question: r.question ?? '',
  }));
}

/** Goal id, function and practice name of the 34 CPG 2.0 goals, from the CSET input. */
export function readCpg2Goals(file: string): Map<string, Cpg2Goal> {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
    groupings: Array<{ id: number; title: string }>;
    questions: Array<{
      title: string;
      groupingId: number;
      parentQuestionId: number | null;
      securityPractice: string | null;
    }>;
  };
  const grouping = new Map(parsed.groupings.map((g) => [g.id, g.title]));
  const goals = new Map<string, Cpg2Goal>();
  for (const q of parsed.questions) {
    if (q.parentQuestionId !== null || !q.title) continue;
    goals.set(q.title, {
      id: q.title,
      function: grouping.get(q.groupingId) ?? '',
      practice: q.securityPractice ?? q.title,
    });
  }
  return goals;
}
