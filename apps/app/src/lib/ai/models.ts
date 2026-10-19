import { openai } from '@ai-sdk/openai';
import { DEFAULT_AI_MODEL_IDS } from './model-ids';

/**
 * Single swap point for every language-model call in the app.
 *
 * BNI runs all AI work on OpenAI (the prepaid credit fund), so the three tiers
 * below replace the per-file Anthropic / gateway model choices upstream ships.
 * Defaults live in ./model-ids.ts. Override per environment with
 * OPENAI_MODEL_FLAGSHIP / OPENAI_MODEL_BALANCED / OPENAI_MODEL_FAST, e.g. to
 * point at an Azure OpenAI deployment name in production.
 */
export const AI_MODEL_IDS = {
  /** Most capable: remediation plans, policy generation, auditor content. */
  flagship: process.env.OPENAI_MODEL_FLAGSHIP ?? DEFAULT_AI_MODEL_IDS.flagship,
  /** Near-flagship at lower cost: extraction, drafting, chat, onboarding. */
  balanced: process.env.OPENAI_MODEL_BALANCED ?? DEFAULT_AI_MODEL_IDS.balanced,
  /** High-volume, cheap: classification, short descriptions, reranking. */
  fast: process.env.OPENAI_MODEL_FAST ?? DEFAULT_AI_MODEL_IDS.fast,
} as const;

export type AiModelTier = keyof typeof AI_MODEL_IDS;

export function aiModel(tier: AiModelTier) {
  return openai(AI_MODEL_IDS[tier]);
}
