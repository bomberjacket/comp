'use client';

import { apiClient } from '@/lib/api-client';
import type {
  AnswerDomain,
  AnswerValue,
  FrameworkAnswerResults,
  FrameworkAnswers,
} from '@/types/framework-answers';
import { useCallback } from 'react';
import useSWR from 'swr';

export interface AnswerInput {
  requirementId: string;
  domain?: AnswerDomain;
  answer: AnswerValue;
  justification?: string;
  comment?: string;
  markForReview?: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiClient.get<T>(url);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

/**
 * Answers of a question-based (CSET) framework instance. The GET 404s for
 * frameworks without an answer profile, which `enabled` short-circuits.
 */
export function useFrameworkAnswers(frameworkInstanceId: string, enabled = true) {
  const key = enabled && frameworkInstanceId ? `/v1/framework-answers/${frameworkInstanceId}` : null;
  const { data, error, isLoading, mutate } = useSWR<FrameworkAnswers>(key, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const saveAnswers = useCallback(
    async (answers: AnswerInput[]) => {
      const res = await apiClient.put<FrameworkAnswers>(`/v1/framework-answers/${frameworkInstanceId}`, {
        answers,
      });
      if (res.error || !res.data) throw new Error(res.error ?? 'Could not save');
      await mutate(res.data, { revalidate: false });
      return res.data;
    },
    [frameworkInstanceId, mutate],
  );

  const saveDomains = useCallback(
    async (domains: Array<'it' | 'ot'>) => {
      const res = await apiClient.put<FrameworkAnswers>(
        `/v1/framework-answers/${frameworkInstanceId}/settings`,
        { domains },
      );
      if (res.error || !res.data) throw new Error(res.error ?? 'Could not save');
      await mutate(res.data, { revalidate: false });
      return res.data;
    },
    [frameworkInstanceId, mutate],
  );

  const importCset = useCallback(
    async (payload: unknown) => {
      const res = await apiClient.post<{ imported: number; skipped: number; unmatched: string[]; seen: number }>(
        `/v1/framework-answers/${frameworkInstanceId}/import/cset`,
        { payload },
      );
      if (res.error || !res.data) throw new Error(res.error ?? 'Import failed');
      await mutate();
      return res.data;
    },
    [frameworkInstanceId, mutate],
  );

  const exportCset = useCallback(async () => {
    return fetchJson<unknown>(`/v1/framework-answers/${frameworkInstanceId}/export/cset`);
  }, [frameworkInstanceId]);

  return {
    data,
    /** true when the framework has no answer profile (404) */
    unsupported: !!error && /not answered|not found/i.test(error.message),
    error,
    isLoading,
    mutate,
    saveAnswers,
    saveDomains,
    importCset,
    exportCset,
  };
}

export function useFrameworkAnswerResults(frameworkInstanceId: string, enabled = true) {
  const key = enabled && frameworkInstanceId ? `/v1/framework-answers/${frameworkInstanceId}/results` : null;
  return useSWR<FrameworkAnswerResults>(key, fetchJson, { revalidateOnFocus: false, shouldRetryOnError: false });
}
