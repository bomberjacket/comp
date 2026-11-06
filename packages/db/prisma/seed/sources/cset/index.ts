/**
 * CISA CSET seed generator. Reads ./inputs/cset-*.json (made by ./extract) and writes
 * Comp AI framework-editor seed files next to the upstream ones, suffixed `.cset.json`.
 * Run from the repo root:
 *
 *   bun packages/db/prisma/seed/sources/cset/index.ts
 *
 * Eight frameworks under one family: CPG 2.0, IMR, HHS 405(d), MVRA, CRR, EDM, RRA and
 * AWWA 4.0. Requirement rows are CSET's answerable questions; controls are CSET's goals
 * (or categories); one evidence task per control; one policy per family. The CSET answer
 * options and IT/OT domain mode per framework go to ./derived/answer-profiles.json for the
 * answer layer.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readUpstreamIds, writeOutputs, type VersionEntry } from '../nist-800-171/write';
import { buildMaturity } from './build-maturity';
import { merge, toRows, type ModuleRows } from './build-rows';
import { buildStandard } from './build-standard';
import { ids } from './ids';
import { MODULES } from './modules';
import type { FamilyRow, MaturityModuleJson, StandardModuleJson } from './types';
import { validate } from './validate';

const HERE = __dirname;
const INPUTS = path.join(HERE, 'inputs');
const DERIVED = path.join(HERE, 'derived');
const SEED_DIR = path.resolve(HERE, '..', '..');
export const SUFFIX = 'cset';

const FAMILY: FamilyRow = {
  id: ids.family(),
  name: 'CISA assessments (CSET)',
  description:
    "Assessment modules from CISA's Cyber Security Evaluation Tool: Cybersecurity Performance Goals 2.0, " +
    'Incident Management Review, Cyber Resilience Review, External Dependencies Management, Ransomware ' +
    'Readiness Assessment, Minimum Viable Resilience Assessment, HHS 405(d) and AWWA 4.0.',
  status: 'visible',
};

function main(): void {
  const parts: ModuleRows[] = [];
  for (const module of MODULES) {
    const raw = JSON.parse(readFileSync(path.join(INPUTS, module.inputFile), 'utf8')) as MaturityModuleJson | StandardModuleJson;
    if (raw.kind !== module.kind) throw new Error(`${module.key}: input is ${raw.kind}, module says ${module.kind}`);
    const build = raw.kind === 'maturity' ? buildMaturity(module, raw) : buildStandard(module, raw);
    parts.push(toRows(build, FAMILY.id));
  }
  const data = merge(FAMILY, parts);
  const summary = validate(data, parts, readUpstreamIds(SEED_DIR, SUFFIX));

  const versions: VersionEntry[] = parts.map((p) => ({
    frameworkId: p.framework.id,
    version: '1.0.0',
    releaseNotes: `Initial ${p.framework.name} release from CISA CSET v13 content: ${p.requirements.length} requirements, ${p.controls.length} controls, ${p.policies.length} policies, ${p.tasks.length} evidence tasks.`,
  }));
  const written = writeOutputs(SEED_DIR, data, versions, SUFFIX);
  mkdirSync(DERIVED, { recursive: true });
  const profiles = path.join(DERIVED, 'answer-profiles.json');
  writeFileSync(profiles, `${JSON.stringify(parts.map((p) => p.profile), null, 2)}\n`);
  written.push(profiles);
  console.log(summary);
  console.log(`wrote ${written.length} files:`);
  for (const f of written) console.log(`  ${path.relative(SEED_DIR, f)}`);
}

main();
