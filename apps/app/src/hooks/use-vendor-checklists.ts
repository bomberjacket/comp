'use client';

import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import useSWR from 'swr';

export type VendorChecklistKind = 'epa_supplier' | 'epa_integrator_msp';

export interface VendorChecklistItemDef {
  id: string;
  section: string;
  question: string;
  exampleResponse: string;
  recommendation: string;
  referenceUrl: string;
}

export interface VendorChecklistDef {
  kind: VendorChecklistKind;
  name: string;
  source: string;
  sections: string[];
  items: VendorChecklistItemDef[];
}

export interface VendorChecklistDefinitions {
  checklists: VendorChecklistDef[];
  weightScale: Record<string, string>;
  scoreScale: Record<string, string>;
}

export interface ChecklistItemAnswer {
  itemId: string;
  weight: number;
  score: number;
  supplierResponse?: string;
  inContract?: boolean | null;
  explanation?: string;
}

export interface ChecklistSectionResult {
  section: string;
  items: number;
  scored: number;
  target: number;
  actual: number;
  gap: number;
  percent: number | null;
}

export interface ChecklistAssessment {
  id: string | null;
  kind: VendorChecklistKind;
  name: string;
  contractReference: string | null;
  evaluationFrequency: string | null;
  notes: string | null;
  assessedAt: string | null;
  assessedById: string | null;
  updatedAt: string | null;
  items: ChecklistItemAnswer[];
  results: {
    sections: ChecklistSectionResult[];
    target: number;
    actual: number;
    gap: number;
    percent: number | null;
    inContract: number;
  };
}

export interface SaveChecklistInput {
  items: ChecklistItemAnswer[];
  contractReference?: string;
  evaluationFrequency?: string;
  notes?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiClient.get<T>(url);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

/** The EPA checklist items and scales (static per deployment). */
export function useVendorChecklistDefinitions() {
  return useSWR<VendorChecklistDefinitions>('/v1/vendor-checklists/definitions', fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

/** Both EPA checklists for one vendor, scored, with a save function per kind. */
export function useVendorChecklists(vendorId: string) {
  const key = vendorId ? `/v1/vendor-checklists/vendors/${vendorId}` : null;
  const { data, error, isLoading, mutate } = useSWR<ChecklistAssessment[]>(key, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const save = useCallback(
    async (kind: VendorChecklistKind, input: SaveChecklistInput) => {
      const res = await apiClient.put<ChecklistAssessment>(
        `/v1/vendor-checklists/vendors/${vendorId}/${kind}`,
        input,
      );
      if (res.error || !res.data) throw new Error(res.error ?? 'Could not save the checklist');
      const saved = res.data;
      await mutate((prev) => (prev ?? []).map((a) => (a.kind === kind ? saved : a)), { revalidate: false });
      return saved;
    },
    [vendorId, mutate],
  );

  return { assessments: data ?? [], error, isLoading, save, refresh: mutate };
}
