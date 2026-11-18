'use client';

import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';

export interface RosterPerson {
  name: string;
  title: string;
  phone: string;
  email: string;
  /** Key of the role whose person also holds this role. */
  sameAs: string;
}

export interface RosterContact {
  name: string;
  detail: string;
  phone: string;
  none: boolean;
}

export interface RosterInput {
  staff: Record<string, RosterPerson>;
  contacts: Record<string, RosterContact>;
  facts: Record<string, string>;
}

export interface WaterRoster extends RosterInput {
  definition: {
    roles: Array<{ key: string; label: string; hint: string; defaultSameAs?: string }>;
    contacts: Array<{ key: string; label: string; nameLabel: string; detailLabel: string; phoneLabel: string; allowNone?: boolean }>;
    facts: Array<{ key: string; label: string; hint: string; long?: boolean; optional?: boolean }>;
  };
  /** False until the list has been saved once. */
  saved: boolean;
  /** Ids of the vendors marked as having network or remote access; null until any is marked (then all count). */
  accessVendors: string[] | null;
  progress: { filled: number; total: number };
  /** Distinct people with the roles each holds. */
  people: Array<{ name: string; roles: string[] }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiClient.get<T>(url);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

/** The utility's Who's who list: people, outside contacts and shared facts that both plans read from. */
export function useWaterRoster(frameworkInstanceId: string, enabled = true) {
  const key = enabled && frameworkInstanceId ? `/v1/water-program/${frameworkInstanceId}/roster` : null;
  const { data, error, isLoading, mutate } = useSWR<WaterRoster>(key, fetchJson, { revalidateOnFocus: false, shouldRetryOnError: false });
  const { mutate: mutateAny } = useSWRConfig();

  const save = useCallback(
    async (input: RosterInput) => {
      const res = await apiClient.put<WaterRoster>(`/v1/water-program/${frameworkInstanceId}/roster`, input);
      if (res.error || !res.data) throw new Error(res.error ?? "Could not save the Who's who list");
      await mutate(res.data, { revalidate: false });
      // The plan boxes that read from the list show the new values straight away.
      await mutateAny(`/v1/water-program/${frameworkInstanceId}/plans`);
      return res.data;
    },
    [frameworkInstanceId, mutate, mutateAny],
  );

  const saveAccessVendors = useCallback(
    async (vendorIds: string[]) => {
      const res = await apiClient.put<WaterRoster>(`/v1/water-program/${frameworkInstanceId}/roster/vendors`, { vendorIds });
      if (res.error || !res.data) throw new Error(res.error ?? 'Could not save the vendor marks');
      const { accessVendors, saved } = res.data;
      // Only the marks changed; keep whatever is being typed in the rest of the list.
      await mutate((prev) => (prev ? { ...prev, accessVendors, saved } : res.data), { revalidate: false });
      await mutateAny(`/v1/water-program/${frameworkInstanceId}/plans`);
    },
    [frameworkInstanceId, mutate, mutateAny],
  );

  return { roster: data, error, isLoading, save, saveAccessVendors };
}
