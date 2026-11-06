/**
 * CSET content extractor. Reads CSV dumps of a CSET database (made with
 * extract/dump-localdb.ps1 against the standalone install's LocalDB) and writes one
 * JSON file per module into ../inputs. The dump is untrusted data read as text and is
 * never committed; the JSON outputs are.
 *
 *   bun packages/db/prisma/seed/sources/cset/extract/index.ts --csv <dump dir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exportMaturityModel, exportStandardSet } from './export';
import { emptyTables, loadCsvDumps, type Tables } from './tables';

/** Counts as read from the CSET v13.0.0.0 database on 2026-11-06; a mismatch means CSET changed. */
const MATURITY_MODULES: Array<{ file: string; modelId: number; questions: number; groupings: number }> = [
  { file: 'cpg2', modelId: 21, questions: 102, groupings: 6 },
  { file: 'imr', modelId: 15, questions: 88, groupings: 26 },
  { file: 'crr', modelId: 4, questions: 397, groupings: 92 },
  { file: 'edm', modelId: 3, questions: 116, groupings: 25 },
  { file: 'rra', modelId: 5, questions: 48, groupings: 11 },
  { file: 'mvra', modelId: 9, questions: 524, groupings: 179 },
];
const STANDARD_MODULES: Array<{ file: string; setName: string; requirements: number }> = [
  { file: 'hhs405d', setName: 'HHS405d', requirements: 63 },
  { file: 'awwa40', setName: 'AWWA 4.0', requirements: 100 },
];

function stable(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const csvDir = argv[0] === '--csv' ? argv[1] : undefined;
  if (!csvDir || argv.length !== 2) throw new Error('usage: index.ts --csv <dump dir>');
  const outDir = path.resolve(__dirname, '..', 'inputs');
  mkdirSync(outDir, { recursive: true });

  const tables: Tables = emptyTables();
  const rows = loadCsvDumps(csvDir, tables);
  const versionFile = path.join(csvDir, 'VERSION.txt');
  const version = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';
  const source = `CISA CSET v${version} (github.com/cisagov/cset), MIT licence, Battelle Energy Alliance`;
  console.log(`loaded ${rows} rows from csv dumps (CSET ${version})`);

  const failures: string[] = [];
  for (const m of MATURITY_MODULES) {
    const doc = exportMaturityModel(tables, m.modelId, source);
    if (doc.questions.length !== m.questions)
      failures.push(`${m.file}: expected ${m.questions} questions, got ${doc.questions.length}`);
    if (doc.groupings.length !== m.groupings)
      failures.push(`${m.file}: expected ${m.groupings} groupings, got ${doc.groupings.length}`);
    writeFileSync(path.join(outDir, `cset-${m.file}.json`), stable(doc));
    console.log(`wrote cset-${m.file}.json (${doc.questions.length} questions, ${doc.groupings.length} groupings)`);
  }
  for (const s of STANDARD_MODULES) {
    const doc = exportStandardSet(tables, s.setName, source);
    if (doc.requirements.length !== s.requirements)
      failures.push(`${s.file}: expected ${s.requirements} requirements, got ${doc.requirements.length}`);
    writeFileSync(path.join(outDir, `cset-${s.file}.json`), stable(doc));
    console.log(`wrote cset-${s.file}.json (${doc.requirements.length} requirements)`);
  }
  if (failures.length > 0) throw new Error(`Count checks failed:\n- ${failures.join('\n- ')}`);
}

main();
