/**
 * Seed ids of the water and wastewater framework (packages/db/prisma/seed/sources/water,
 * namespace comp-water/v1; deterministic, so safe to reference here).
 */
export const WATER_FRAMEWORK_ID = 'frk_1d3256a64aeccf2765842f80';

export const WATER_PLAN_TEMPLATES = [
  { id: 'frk_pt_6a7ba685071773722f1806b2', key: 'crmp', label: 'Cybersecurity Risk Management Plan' },
  { id: 'frk_pt_128039a155273c7783165d34', key: 'cirp', label: 'Cyber Incident Response Plan' },
] as const;

/** Paragraph the plan templates leave under every section until the utility writes its own text. */
export const PLAN_PROMPT_TEXT = 'What to record here:';

export const INTERVIEW_TASK_PREFIX = 'Interview evidence:';
export const EPA_PRIORITY_MARK = '(EPA priority cybersecurity practice)';
