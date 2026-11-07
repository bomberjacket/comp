import type { WaterBuild } from './build';
import type { GeneratedData } from './types';

export const EXPECTED = {
  requirements: 33,
  epaPriority: 16,
  functions: 5,
  /** distinct CPG 2.0 goals the 33 questions crosswalk to */
  goals: 27,
  policies: 2,
};

const FREQUENCIES = new Set(['monthly', 'quarterly', 'yearly']);
const DEPARTMENTS = new Set(['none', 'admin', 'gov', 'hr', 'it', 'itsm', 'qms']);

class Checker {
  readonly failures: string[] = [];
  eq(label: string, actual: number, expected: number): void {
    if (actual !== expected) this.failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
  ok(label: string, condition: boolean): void {
    if (!condition) this.failures.push(label);
  }
}

/**
 * `otherSetIds` are the ids of every other seed set (upstream, NIST, CSET): the water
 * framework must not collide with them and must find its borrowed CPG 2.0 control and
 * task templates among them.
 */
export function validate(data: GeneratedData, b: WaterBuild, otherSetIds: Set<string>): string {
  const c = new Checker();
  c.eq('requirements', b.requirements.length, EXPECTED.requirements);
  c.eq('EPA priority practices', b.requirements.filter((r) => r.description.includes('(EPA priority cybersecurity practice)')).length, EXPECTED.epaPriority);
  c.eq('functions', new Set(b.requirements.map((r) => r.requirementFamily)).size, EXPECTED.functions);
  c.eq('borrowed CPG 2.0 controls', b.borrowedControlIds.length, EXPECTED.goals);
  c.eq('borrowed CPG 2.0 evidence tasks', b.borrowedTaskIds.length, EXPECTED.goals);
  c.eq('plan policies', b.policies.length, EXPECTED.policies);
  c.eq('control-requirement pairs', b.controlRequirementPairs.length, EXPECTED.requirements);
  c.eq('policy links (one per goal)', b.policyLinks.length, EXPECTED.goals);
  c.eq('task links (evidence per goal + interview tasks)', b.taskLinks.length, EXPECTED.goals + b.tasks.length);
  c.ok('interview tasks exist', b.tasks.length >= 10);
  c.ok('every interview task is linked to a borrowed control', b.controlTaskPairs.every((p) => b.borrowedControlIds.includes(p.A)));

  const idents = b.requirements.map((r) => r.identifier);
  c.eq('identifiers unique', new Set(idents).size, idents.length);
  c.ok('identifiers have no whitespace', idents.every((i) => !/\s/.test(i)));
  c.eq('sortOrder unique', new Set(b.requirements.map((r) => r.sortOrder)).size, idents.length);

  const generated = new Set<string>();
  const dupes: string[] = [];
  const everything = [...data.families, ...data.frameworks, ...data.requirements, ...data.controls, ...data.policies, ...data.tasks, ...data.policyLinks, ...data.taskLinks];
  for (const row of everything) {
    if (generated.has(row.id) || otherSetIds.has(row.id)) dupes.push(row.id);
    generated.add(row.id);
  }
  c.ok(`ids unique across generated and other seed sets (dupes: ${dupes.slice(0, 5).join(', ')})`, dupes.length === 0);
  c.ok('borrowed CPG 2.0 controls exist in the CSET set', b.borrowedControlIds.every((id) => otherSetIds.has(id)));
  c.ok('borrowed CPG 2.0 tasks exist in the CSET set', b.borrowedTaskIds.every((id) => otherSetIds.has(id)));
  const known = (id: string): boolean => generated.has(id) || otherSetIds.has(id);
  c.ok('control-requirement pairs resolve', data.controlRequirementPairs.every((p) => known(p.A) && generated.has(p.B)));
  c.ok('control-policy pairs resolve', data.controlPolicyPairs.every((p) => known(p.A) && generated.has(p.B)));
  c.ok('control-task pairs resolve', data.controlTaskPairs.every((p) => known(p.A) && generated.has(p.B)));
  c.ok(
    'scoped links resolve',
    data.policyLinks.every((l) => generated.has(l.frameworkId) && known(l.controlTemplateId) && generated.has(l.policyTemplateId)) &&
      data.taskLinks.every((l) => generated.has(l.frameworkId) && known(l.controlTemplateId) && known(l.taskTemplateId)),
  );
  c.ok('no generated controls (all borrowed)', data.controls.length === 0);
  c.ok(
    'enum values valid',
    data.policies.every((p) => FREQUENCIES.has(p.frequency) && DEPARTMENTS.has(p.department)) &&
      data.tasks.every((t) => FREQUENCIES.has(t.frequency) && DEPARTMENTS.has(t.department)),
  );
  c.ok('descriptions non-empty', everything.every((row) => !('description' in row) || String(row.description).trim().length > 0));
  c.ok('names within limits', data.requirements.every((r) => r.name.length <= 200) && everything.every((row) => !('name' in row) || String(row.name).length <= 255));
  c.ok('no html in requirement text', data.requirements.every((r) => !/<[a-z][^>]*>/i.test(r.description)));
  c.ok(
    'policy content is a TipTap doc',
    data.policies.every((p) => {
      const content = p.content as { type?: unknown; content?: unknown };
      return content.type === 'doc' && Array.isArray(content.content) && content.content.length > 0;
    }),
  );
  c.ok('answer profile', b.profile.answerOptions.join(',') === 'Y,I,N,NA' && b.profile.domainMode === 'single' && b.profile.scoring === 'standard');

  if (c.failures.length > 0) throw new Error(`Validation failed:\n- ${c.failures.join('\n- ')}`);
  return [
    `framework=${b.framework.name} requirements=${b.requirements.length} borrowed controls=${b.borrowedControlIds.length}`,
    `policies=${b.policies.length} interview tasks=${b.tasks.length} task links=${b.taskLinks.length} policy links=${b.policyLinks.length}`,
  ].join('\n');
}
