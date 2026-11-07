#!/usr/bin/env bun
/**
 * Write the list of NIST SP 800-171 assessment objectives that at least one
 * integration check maps to, so the NIST seed generator can mark their evidence
 * task templates AUTOMATED (Comp AI only runs integration checks on, and shows
 * the Automations tab for, tasks that are not MANUAL).
 *
 *   bun run scripts/export-automated-objectives.ts
 *
 * Output: packages/db/prisma/seed/sources/nist-800-171/inputs/automated-objectives.json
 * Re-run after adding or remapping checks, then re-run the NIST generator and seed.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getAllManifests } from '../src/registry';
import { NIST_800_171_TASK_TEMPLATES } from '../src/task-mappings.nist-800-171';

const OUTPUT = join(
  __dirname,
  '../../db/prisma/seed/sources/nist-800-171/inputs/automated-objectives.json',
);

const objectiveOfTemplate = new Map<string, string>(
  Object.entries(NIST_800_171_TASK_TEMPLATES).map(([objective, id]) => [id, objective]),
);

const byObjective = new Map<string, Set<string>>();
for (const manifest of getAllManifests()) {
  for (const check of manifest.checks ?? []) {
    const objective = check.taskMapping ? objectiveOfTemplate.get(check.taskMapping) : undefined;
    if (!objective) continue;
    const providers = byObjective.get(objective) ?? new Set<string>();
    providers.add(manifest.id);
    byObjective.set(objective, providers);
  }
}

const objectives = [...byObjective.keys()].sort();
const payload = {
  generatedBy: 'packages/integration-platform/scripts/export-automated-objectives.ts',
  description:
    'NIST SP 800-171 assessment objectives with at least one integration check; their task templates are seeded AUTOMATED.',
  objectives: objectives.map((objective) => ({
    objective,
    providers: [...(byObjective.get(objective) ?? [])].sort(),
  })),
};
writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${objectives.length} automated objectives to ${OUTPUT}`);
