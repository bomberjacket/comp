/**
 * Task template mappings available to integration checks.
 *
 * Upstream's generated list lives in `task-mappings.upstream.ts` (unchanged). BNI's
 * NIST SP 800-171 evidence tasks, one per assessment objective, are generated into
 * `task-mappings.nist-800-171.ts` by `scripts/generate-nist-task-mappings.ts` and merged
 * here, so a check can map to a single objective (e.g. `TASK_TEMPLATES['3.5.3[a]']`).
 */
import {
  NIST_800_171_TASK_TEMPLATES,
  NIST_800_171_TASK_TEMPLATE_IDS,
  NIST_800_171_TASK_TEMPLATE_INFO,
} from './task-mappings.nist-800-171';
import {
  TASK_TEMPLATES as UPSTREAM_TASK_TEMPLATES,
  TASK_TEMPLATE_IDS as UPSTREAM_TASK_TEMPLATE_IDS,
  TASK_TEMPLATE_INFO as UPSTREAM_TASK_TEMPLATE_INFO,
} from './task-mappings.upstream';

/** All available task template IDs that can be used for task mapping. */
export const TASK_TEMPLATE_IDS = [
  ...UPSTREAM_TASK_TEMPLATE_IDS,
  ...NIST_800_171_TASK_TEMPLATE_IDS,
] as const;

/** Union type of all valid task template IDs. */
export type TaskTemplateId = (typeof TASK_TEMPLATE_IDS)[number];

/** Mapping of task names (upstream camelCase keys, NIST objective ids) to template IDs. */
export const TASK_TEMPLATES = {
  ...UPSTREAM_TASK_TEMPLATES,
  ...NIST_800_171_TASK_TEMPLATES,
} as const;

/** Task template metadata for reference. */
export const TASK_TEMPLATE_INFO: Record<
  TaskTemplateId,
  { name: string; description: string; department: string; frequency: string }
> = {
  ...UPSTREAM_TASK_TEMPLATE_INFO,
  ...NIST_800_171_TASK_TEMPLATE_INFO,
};
