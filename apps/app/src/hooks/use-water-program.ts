'use client';

import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import useSWR from 'swr';

/** Seed id of the water and wastewater framework (deterministic, see sources/water/ids.ts). */
export const WATER_FRAMEWORK_ID = 'frk_1d3256a64aeccf2765842f80';

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export interface WaterProgramStep {
  key: 'plans' | 'assess' | 'gaps' | 'evidence' | 'vendors' | 'tabletop';
  title: string;
  description: string;
  status: StepStatus;
  done: number;
  total: number;
  summary: string;
  /** app path under /<orgId>/ */
  href: string;
  details: Array<{ label: string; status: string; href?: string }>;
}

export interface WaterProgram {
  frameworkInstanceId: string;
  frameworkName: string;
  steps: WaterProgramStep[];
}

export interface WaterPlanSection {
  index: number;
  title: string;
  guidance: string[];
  prompts: string[];
  record: string;
  done: boolean;
}

export interface WaterPlan {
  key: 'crmp' | 'cirp';
  policyId: string;
  name: string;
  status: string;
  sections: WaterPlanSection[];
  written: number;
  total: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiClient.get<T>(url);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

export function useWaterProgram(frameworkInstanceId: string, enabled = true) {
  const key = enabled && frameworkInstanceId ? `/v1/water-program/${frameworkInstanceId}` : null;
  return useSWR<WaterProgram>(key, fetchJson, { revalidateOnFocus: true, shouldRetryOnError: false });
}

/** The two plan documents split into sections, with a save per section and publish per plan. */
export function useWaterPlans(frameworkInstanceId: string, enabled = true) {
  const key = enabled && frameworkInstanceId ? `/v1/water-program/${frameworkInstanceId}/plans` : null;
  const { data, error, isLoading, mutate } = useSWR<WaterPlan[]>(key, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const saveSection = useCallback(
    async (policyId: string, index: number, text: string) => {
      const res = await apiClient.put<WaterPlan>(
        `/v1/water-program/${frameworkInstanceId}/plans/${policyId}/sections/${index}`,
        { text },
      );
      if (res.error || !res.data) throw new Error(res.error ?? 'Could not save the section');
      const saved = res.data;
      await mutate((prev) => (prev ?? []).map((p) => (p.policyId === policyId ? saved : p)), { revalidate: false });
      return saved;
    },
    [frameworkInstanceId, mutate],
  );

  const publish = useCallback(
    async (policyId: string) => {
      const res = await apiClient.post(`/v1/policies/${policyId}/versions/publish`, {});
      if (res.error) throw new Error(res.error);
      await mutate();
    },
    [mutate],
  );

  return { plans: data ?? [], error, isLoading, saveSection, publish, refresh: mutate };
}
