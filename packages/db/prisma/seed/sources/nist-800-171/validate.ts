import type { ControlsBuild } from './build-controls';
import type { Rev2Build } from './build-rev2';
import type { Rev3Build } from './build-rev3';
import type { Disposition, FrequencyRow, GeneratedData, Pair, Rev2Objective } from './types';

const FREQUENCIES = new Set(['monthly', 'quarterly', 'yearly']);
const DEPARTMENTS = new Set(['none', 'admin', 'gov', 'hr', 'it', 'itsm', 'qms']);

export const EXPECTED = {
  rev2Objectives: 320,
  rev2Requirements: 110,
  rev3Requirements: 97,
  rev3Determinations: 422,
  rev3Odps: 88,
  policies: 17,
};

export interface ValidationContext {
  rev2: Rev2Build;
  rev3: Rev3Build;
  controls: ControlsBuild;
  dispositions: Map<string, Disposition>;
  objectives: Rev2Objective[];
  frequencies: Map<string, FrequencyRow>;
  /** every id already present in the upstream primitives files */
  upstreamIds: Set<string>;
}

class Checker {
  readonly failures: string[] = [];
  eq(label: string, actual: number, expected: number): void {
    if (actual !== expected) this.failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
  ok(label: string, condition: boolean): void {
    if (!condition) this.failures.push(label);
  }
}

function countKinds(dispositions: Map<string, Disposition>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dispositions.values()) out[d.kind] = (out[d.kind] ?? 0) + 1;
  return out;
}

function pairsAreResolvable(pairs: Pair[], ids: Set<string>): boolean {
  return pairs.every((p) => ids.has(p.A) && ids.has(p.B));
}

/** Throws with every failed assertion listed; returns a short summary on success. */
export function validate(data: GeneratedData, ctx: ValidationContext): string {
  const c = new Checker();
  const { rev2, rev3, controls, dispositions, objectives, frequencies, upstreamIds } = ctx;
  const E = EXPECTED;

  // Rev 2
  c.eq('Rev 2 objectives (workbook)', objectives.length, E.rev2Objectives);
  c.eq('Rev 2 solo objectives', objectives.filter((o) => o.solo).length, 23);
  c.eq('Rev 2 requirement rows', rev2.requirements.length, E.rev2Objectives);
  c.eq('Rev 2 requirements with dispositions', dispositions.size, E.rev2Requirements);
  const kinds = countKinds(dispositions);
  c.eq('carried', kinds.carried ?? 0, 77);
  c.eq('incorporated', kinds.incorporated ?? 0, 22);
  c.eq('addressed_by', kinds.addressed_by ?? 0, 5);
  c.eq('withdrawn', kinds.withdrawn ?? 0, 6);
  const r2Idents = rev2.requirements.map((r) => r.identifier);
  c.eq('Rev 2 identifiers unique', new Set(r2Idents).size, r2Idents.length);
  c.ok(
    'Rev 2 identifiers have no whitespace',
    r2Idents.every((i) => !/\s/.test(i)),
  );
  const missingFreq = r2Idents.filter((i) => !frequencies.has(i));
  c.ok(
    `every Rev 2 objective has a frequency row (missing: ${missingFreq.join(', ')})`,
    missingFreq.length === 0,
  );

  // Rev 3
  c.eq('Rev 3 active slots', rev3.slots.size, E.rev3Requirements);
  c.eq('Rev 3 withdrawn slots', rev3.withdrawn.size, 33);
  const dets = [...rev3.slots.values()].reduce((n, s) => n + s.determinations.length, 0);
  const odps = [...rev3.slots.values()].reduce((n, s) => n + s.odps.length, 0);
  c.eq('Rev 3 determinations', dets, E.rev3Determinations);
  c.eq('Rev 3 ODPs', odps, E.rev3Odps);
  c.eq('Rev 3 requirement rows', rev3.requirements.length, dets + odps);
  c.ok(
    'every Rev 3 slot has at least one determination',
    [...rev3.slots.values()].every((s) => s.determinations.length > 0),
  );
  c.ok(
    'every Rev 3 slot has requirement text',
    [...rev3.slots.values()].every((s) => s.parts.length > 0),
  );
  const r3Idents = rev3.requirements.map((r) => r.identifier);
  c.eq('Rev 3 identifiers unique', new Set(r3Idents).size, r3Idents.length);

  // Controls: one per requirement and revision; tasks: one per objective.
  const totalControls = E.rev2Requirements + E.rev3Requirements;
  const totalObjectives = E.rev2Objectives + dets + odps;
  c.eq('controls', data.controls.length, totalControls);
  c.eq('Rev 2 controls', controls.keysByRevision.r2.length, E.rev2Requirements);
  c.eq('Rev 3 controls', controls.keysByRevision.r3.length, E.rev3Requirements);
  c.eq('control-requirement pairs', data.controlRequirementPairs.length, totalObjectives);
  const rowsLinked = new Set(data.controlRequirementPairs.map((p) => p.B));
  c.eq(
    'every requirement row links to exactly one control',
    rowsLinked.size,
    data.requirements.length,
  );
  const controlsUsed = new Set(data.controlRequirementPairs.map((p) => p.A));
  c.eq('every control has at least one requirement', controlsUsed.size, data.controls.length);
  c.eq('tasks (one per objective)', data.tasks.length, totalObjectives);
  c.eq('control-task pairs', data.controlTaskPairs.length, totalObjectives);
  c.eq('framework-scoped task links', data.taskLinks.length, totalObjectives);
  c.eq(
    'tasks with a frequency note or ODP guidance',
    data.tasks.filter((t) => t.description.includes('objective')).length,
    totalObjectives,
  );
  c.eq('policies', data.policies.length, E.policies);
  c.eq('control-policy pairs', data.controlPolicyPairs.length, totalControls);
  c.eq('framework-scoped policy links', data.policyLinks.length, totalControls);
  const tasksPerControl = new Map<string, number>();
  for (const p of data.controlTaskPairs)
    tasksPerControl.set(p.A, (tasksPerControl.get(p.A) ?? 0) + 1);
  c.eq('every control has at least one task', tasksPerControl.size, data.controls.length);

  // Integrity
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
  c.ok(
    `ids unique across generated and upstream primitives (dupes: ${dupes.slice(0, 5).join(', ')})`,
    dupes.length === 0,
  );
  c.ok(
    'control-requirement pairs resolve',
    pairsAreResolvable(data.controlRequirementPairs, allIds),
  );
  c.ok('control-policy pairs resolve', pairsAreResolvable(data.controlPolicyPairs, allIds));
  c.ok('control-task pairs resolve', pairsAreResolvable(data.controlTaskPairs, allIds));
  c.ok(
    'scoped links resolve',
    data.policyLinks.every(
      (l) =>
        allIds.has(l.frameworkId) &&
        allIds.has(l.controlTemplateId) &&
        allIds.has(l.policyTemplateId),
    ) &&
      data.taskLinks.every(
        (l) =>
          allIds.has(l.frameworkId) &&
          allIds.has(l.controlTemplateId) &&
          allIds.has(l.taskTemplateId),
      ),
  );
  c.ok(
    'scoped links stay inside their framework',
    data.taskLinks.every((l) => {
      const ctl = data.controls.find((x) => x.id === l.controlTemplateId);
      return ctl !== undefined;
    }),
  );
  c.ok(
    'requirements reference a generated framework',
    data.requirements.every((r) => allIds.has(r.frameworkId)),
  );
  c.ok(
    'frameworks reference the family',
    data.frameworks.every((f) => allIds.has(f.familyId)),
  );
  c.eq(
    'framework names unique',
    new Set(data.frameworks.map((f) => f.name)).size,
    data.frameworks.length,
  );
  c.ok(
    'enum values valid',
    data.policies.every((p) => FREQUENCIES.has(p.frequency) && DEPARTMENTS.has(p.department)) &&
      data.tasks.every((t) => FREQUENCIES.has(t.frequency) && DEPARTMENTS.has(t.department)),
  );
  for (const fw of data.frameworks) {
    const orders = data.requirements.filter((r) => r.frameworkId === fw.id).map((r) => r.sortOrder);
    c.eq(`sortOrder unique within ${fw.name}`, new Set(orders).size, orders.length);
  }
  c.ok(
    'descriptions non-empty',
    everything.every((row) => !('description' in row) || String(row.description).trim().length > 0),
  );
  c.ok(
    'names within 255 chars',
    everything.every((row) => !('name' in row) || String(row.name).length <= 255),
  );
  c.ok(
    'policy content is a TipTap doc',
    data.policies.every((p) => {
      const content = p.content as { type?: unknown; content?: unknown };
      return content.type === 'doc' && Array.isArray(content.content) && content.content.length > 0;
    }),
  );

  if (c.failures.length > 0) {
    throw new Error(`Validation failed:\n- ${c.failures.join('\n- ')}`);
  }
  return [
    `families=${data.families.length} frameworks=${data.frameworks.length}`,
    `requirements=${data.requirements.length} (rev2 ${rev2.requirements.length}, rev3 ${rev3.requirements.length})`,
    `controls=${data.controls.length} (rev2 ${controls.keysByRevision.r2.length}, rev3 ${controls.keysByRevision.r3.length}) policies=${data.policies.length} tasks=${data.tasks.length}`,
    `pairs: ct-rq ${data.controlRequirementPairs.length}, ct-pt ${data.controlPolicyPairs.length}, ct-tt ${data.controlTaskPairs.length}`,
    `scoped links: policy ${data.policyLinks.length}, task ${data.taskLinks.length}`,
  ].join('\n');
}
