'use client';

import { apiClient } from '@/lib/api-client';
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiClient.get<T>(url);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

export function useWaterProgram(frameworkInstanceId: string, enabled = true) {
  const key = enabled && frameworkInstanceId ? `/v1/water-program/${frameworkInstanceId}` : null;
  return useSWR<WaterProgram>(key, fetchJson, { revalidateOnFocus: true, shouldRetryOnError: false });
}
