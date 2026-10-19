/**
 * Default OpenAI model ids per tier. Plain constants with no SDK import so
 * client components can use them; `models.ts` applies the env overrides on
 * the server. Ids from OpenAI's models page (October 2026).
 */
export const DEFAULT_AI_MODEL_IDS = {
  flagship: 'gpt-6-astra',
  balanced: 'gpt-6.1-sol',
  fast: 'gpt-6-luna',
} as const;
