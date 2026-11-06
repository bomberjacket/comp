import type { ModuleRows } from './build-rows';
import type { GeneratedData, Pair } from './types';

const FREQUENCIES = new Set(['monthly', 'quarterly', 'yearly']);
const DEPARTMENTS = new Set(['none', 'admin', 'gov', 'hr', 'it', 'itsm', 'qms']);

/** Requirement and control counts per module, from the CSET v13.0.0.0 content (2026-11-06). */
export const EXPECTED: Record<string, { requirements: number; controls: number; families: number }> = {
  cpg2: { requirements: 34, controls: 34, families: 6 },
  imr: { requirements: 88, controls: 20, families: 6 },
  hhs405d: { requirements: 63, controls: 19, families: 10 },
  mvra: { requirements: 524, controls: 138, families: 4 },
  crr: { requirements: 397, controls: 82, families: 10 },
  edm: { requirements: 116, controls: 20, families: 4 },
  rra: { requirements: 48, controls: 10, families: 1 },
  awwa40: { requirements: 100, controls: 12, families: 12 },
};

class Checker {
  readonly failures: string[] = [];
  eq(label: string, actual: number, expected: number): void {
    if (actual !== expected) this.failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
  ok(label: string, condition: boolean): void {
    if (!condition) this.failures.push(label);
  }
}

function resolvable(pairs: Pair[], ids: Set<string>): boolean {
  return pairs.every((p) => ids.has(p.A) && ids.has(p.B));
}

/** Throws with every failed assertion listed; returns a short summary on success. */
export function validate(data: GeneratedData, parts: ModuleRows[], upstreamIds: Set<string>): string {
  const c = new Checker();

  for (const p of parts) {
    const key = p.profile.module;
    const e = EXPECTED[key];
    if (!e) {
      c.failures.push(`${key}: no expected counts`);
      continue;
    }
    c.eq(`${key} requirements`, p.requirements.length, e.requirements);
    c.eq(`${key} controls`, p.controls.length, e.controls);
    c.eq(`${key} policies (one per family)`, p.policies.length, e.families);
    c.eq(`${key} tasks (one per control)`, p.tasks.length, e.controls);
    c.eq(`${key} control-requirement pairs`, p.controlRequirementPairs.length, e.requirements);
    c.eq(`${key} scoped task links`, p.taskLinks.length, e.controls);
    c.eq(`${key} scoped policy links`, p.policyLinks.length, e.controls);
    const idents = p.requirements.map((r) => r.identifier);
    c.eq(`${key} identifiers unique`, new Set(idents).size, idents.length);
    c.ok(`${key} identifiers have no whitespace`, idents.every((i) => !/\s/.test(i)));
    const orders = p.requirements.map((r) => r.sortOrder);
    c.eq(`${key} sortOrder unique`, new Set(orders).size, orders.length);
    c.ok(`${key} every control has a requirement`, new Set(p.controlRequirementPairs.map((x) => x.A)).size === p.controls.length);
    c.ok(`${key} answer options non-empty`, p.profile.answerOptions.length >= 2);
  }

  const allIds = new Set<string>();
  const dupes: string[] = [];
  const everything = [
    ...data.families,
    ...data.frameworks,
    ...data.requirements,
    ...data.controls,
    ...data.policies,
    ...data.tasks,
    ...data.policyLinks,
    ...data.taskLinks,
  ];
  for (const row of everything) {
    if (allIds.has(row.id) || upstreamIds.has(row.id)) dupes.push(row.id);
    allIds.add(row.id);
  }
  c.ok(`ids unique across generated, NIST and upstream primitives (dupes: ${dupes.slice(0, 5).join(', ')})`, dupes.length === 0);
  c.ok('control-requirement pairs resolve', resolvable(data.controlRequirementPairs, allIds));
  c.ok('control-policy pairs resolve', resolvable(data.controlPolicyPairs, allIds));
  c.ok('control-task pairs resolve', resolvable(data.controlTaskPairs, allIds));
  c.ok(
    'scoped links resolve',
    data.policyLinks.every((l) => allIds.has(l.frameworkId) && allIds.has(l.controlTemplateId) && allIds.has(l.policyTemplateId)) &&
      data.taskLinks.every((l) => allIds.has(l.frameworkId) && allIds.has(l.controlTemplateId) && allIds.has(l.taskTemplateId)),
  );
  c.ok('requirements reference a generated framework', data.requirements.every((r) => allIds.has(r.frameworkId)));
  c.ok('frameworks reference the family', data.frameworks.every((f) => allIds.has(f.familyId)));
  c.eq('framework names unique', new Set(data.frameworks.map((f) => f.name)).size, data.frameworks.length);
  c.ok(
    'enum values valid',
    data.policies.every((p) => FREQUENCIES.has(p.frequency) && DEPARTMENTS.has(p.department)) &&
      data.tasks.every((t) => FREQUENCIES.has(t.frequency) && DEPARTMENTS.has(t.department)),
  );
  c.ok('descriptions non-empty', everything.every((row) => !('description' in row) || String(row.description).trim().length > 0));
  c.ok('names within limits', data.requirements.every((r) => r.name.length <= 200) && everything.every((row) => !('name' in row) || String(row.name).length <= 255));
  const leftovers = data.requirements.filter((r) => /<[a-z][^>]*>/i.test(r.description) || /&(#\d+|#x[0-9a-f]+|[a-z]{2,8});/.test(r.description));
  c.ok(`no html left in requirement text (${leftovers.slice(0, 3).map((r) => r.identifier).join(', ')})`, leftovers.length === 0);
  c.ok(
    'policy content is a TipTap doc',
    data.policies.every((p) => {
      const content = p.content as { type?: unknown; content?: unknown };
      return content.type === 'doc' && Array.isArray(content.content) && content.content.length > 0;
    }),
  );

  if (c.failures.length > 0) throw new Error(`Validation failed:\n- ${c.failures.join('\n- ')}`);
  return [
    `frameworks=${data.frameworks.length} requirements=${data.requirements.length} controls=${data.controls.length}`,
    `policies=${data.policies.length} tasks=${data.tasks.length}`,
    `pairs: ct-rq ${data.controlRequirementPairs.length}, ct-pt ${data.controlPolicyPairs.length}, ct-tt ${data.controlTaskPairs.length}`,
    ...parts.map((p) => `  ${p.profile.module}: ${p.requirements.length} req, ${p.controls.length} ctl, ${p.policies.length} pol`),
  ].join('\n');
}
