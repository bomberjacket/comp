/**
 * NIST SP 800-171 Rev 2 + Rev 3 seed generator.
 *
 * Reads NIST's official machine-readable sources from ./inputs and writes Comp AI
 * framework-editor seed files (primitives, relations, versions) next to the upstream
 * ones, suffixed `.nist-800-171.json`. Run from the repo root:
 *
 *   bun packages/db/prisma/seed/sources/nist-800-171/index.ts
 *
 * Evidence model: the two revisions are independent. One control per security
 * requirement (110 Rev 2, 97 Rev 3), one evidence task per assessment objective
 * (320 Rev 2, 510 Rev 3 including the 88 organization-defined parameters), and 17
 * family policies shared by both. A reference master artifact list is written to
 * ./derived.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { writeArtifactList } from './artifacts';
import { buildControls, buildDispositions } from './build-controls';
import { buildPoliciesAndTasks } from './build-policies-tasks';
import { buildRev2 } from './build-rev2';
import { buildRev3 } from './build-rev3';
import { ids } from './ids';
import { readCprt } from './read-cprt';
import { readChangeAnalysis, readFrequencies, readR2Titles, readRev2Workbook } from './read-csv';
import type { FamilyRow, GeneratedData } from './types';
import { validate } from './validate';
import { readUpstreamIds, writeOutputs, type VersionEntry } from './write';

const HERE = __dirname;
const INPUTS = path.join(HERE, 'inputs');
const DERIVED = path.join(HERE, 'derived');
const SEED_DIR = path.resolve(HERE, '..', '..');

const FAMILY: FamilyRow = {
  id: ids.family(),
  name: 'NIST SP 800-171',
  description:
    'Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations. ' +
    'Rev 2 is the CMMC Level 2 baseline; Rev 3 is the current NIST publication.',
  status: 'visible',
};

function main(): void {
  const cprt2 = readCprt(path.join(INPUTS, 'SP_800_171_2_0_0.json'));
  const cprt3 = readCprt(path.join(INPUTS, 'SP_800_171_3_0_0.json'));
  const workbook = readRev2Workbook(path.join(INPUTS, '171a-r2-objectives.csv'));
  const changes = readChangeAnalysis(path.join(INPUTS, 'r2-to-r3-change-analysis.csv'));
  const frequencies = readFrequencies(path.join(INPUTS, 'frequencies.csv'));
  const r2Titles = readR2Titles(path.join(INPUTS, 'r2-titles.csv'));

  const rev3 = buildRev3({ familyId: FAMILY.id, cprt: cprt3 });
  const r3Titles = new Map([...rev3.slots.values()].map((s) => [s.slot, s.title]));
  const dispositions = buildDispositions(
    cprt3,
    workbook.requirements.map((r) => r.id),
  );
  const rev2 = buildRev2({
    familyId: FAMILY.id,
    cprt: cprt2,
    requirements: workbook.requirements,
    objectives: workbook.objectives,
    dispositions,
    changes,
    r3Titles,
  });
  const controls = buildControls({
    rev2,
    rev3,
    cprt2,
    requirementsR2: workbook.requirements,
    dispositions,
    r2Titles,
  });
  const pt = buildPoliciesAndTasks({
    controls,
    rev2,
    rev3,
    requirementsR2: workbook.requirements,
    frequencies,
  });

  const data: GeneratedData = {
    families: [FAMILY],
    frameworks: [rev2.framework, rev3.framework],
    requirements: [...rev2.requirements, ...rev3.requirements],
    controls: controls.controls,
    policies: pt.policies,
    tasks: pt.tasks,
    policyLinks: pt.policyLinks,
    taskLinks: pt.taskLinks,
    controlRequirementPairs: controls.controlRequirementPairs,
    controlPolicyPairs: pt.controlPolicyPairs,
    controlTaskPairs: pt.controlTaskPairs,
  };

  const summary = validate(data, {
    rev2,
    rev3,
    controls,
    dispositions,
    objectives: workbook.objectives,
    frequencies,
    upstreamIds: readUpstreamIds(SEED_DIR),
  });

  const versions: VersionEntry[] = [
    {
      frameworkId: rev2.framework.id,
      version: '1.0.0',
      releaseNotes:
        'Initial NIST SP 800-171 Rev 2 release: 320 assessment objectives from SP 800-171A.',
    },
    {
      frameworkId: rev3.framework.id,
      version: '1.0.0',
      releaseNotes:
        'Initial NIST SP 800-171 Rev 3 release: 422 determination statements and 88 organization-defined parameters from SP 800-171A Rev 3.',
    },
    {
      frameworkId: rev2.framework.id,
      version: '2.0.0',
      releaseNotes:
        'Evidence per assessment objective: one control per security requirement (110) and one evidence task per objective (320), each listing the policy, procedure, configuration and operational artifacts from SP 800-171A. Rev 2 is independent of Rev 3.',
    },
    {
      frameworkId: rev3.framework.id,
      version: '2.0.0',
      releaseNotes:
        'Evidence per assessment objective: one control per security requirement (97) and one evidence task per determination statement or organization-defined parameter (510), each listing the artifacts from SP 800-171A Rev 3. Rev 3 is independent of Rev 2.',
    },
  ];
  const written = writeOutputs(SEED_DIR, data, versions);
  mkdirSync(DERIVED, { recursive: true });
  const artifactFile = path.join(DERIVED, 'master-artifact-list.csv');
  writeArtifactList(artifactFile, pt.artifactRows);
  written.push(artifactFile);
  console.log(summary);
  console.log(`wrote ${written.length} files:`);
  for (const f of written) console.log(`  ${path.relative(SEED_DIR, f)}`);
}

main();
