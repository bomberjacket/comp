import { openai } from '@ai-sdk/openai';

/**
 * Single swap point for every language-model call in the API.
 *
 * BNI runs all AI work on OpenAI (the prepaid credit fund), so the three tiers
 * below replace the per-file Anthropic / gateway model choices upstream ships.
 * Ids come from OpenAI's models page (October 2026). Override per environment
 * with OPENAI_MODEL_FLAGSHIP / OPENAI_MODEL_BALANCED / OPENAI_MODEL_FAST, e.g.
 * to point at an Azure OpenAI deployment name in production.
 */
export const AI_MODEL_IDS = {
  /** Most capable: remediation plans, policy generation, auditor content. */
  flagship: process.env.OPENAI_MODEL_FLAGSHIP ?? 'gpt-6-astra',
  /** Near-flagship at lower cost: extraction, drafting, chat, onboarding. */
  balanced: process.env.OPENAI_MODEL_BALANCED ?? 'gpt-6.1-sol',
  /** High-volume, cheap: classification, short descriptions, reranking. */
  fast: process.env.OPENAI_MODEL_FAST ?? 'gpt-6-luna',
} as const;

export type AiModelTier = keyof typeof AI_MODEL_IDS;

export function aiModel(tier: AiModelTier) {
  return openai(AI_MODEL_IDS[tier]);
}
