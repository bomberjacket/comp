'use client';

import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import useSWR from 'swr';

export interface WaterEvidenceTask {
  taskId: string;
  title: string;
  description: string[];
  status: string;
  attachments: number;
  questions: Array<{ identifier: string; name: string; answer: string | null }>;
}

export interface TabletopNote {
  taskId: string;
  discussion: string;
  gaps?: string;
}

export interface TabletopTopic {
  taskId: string;
  title: string;
  status: string;
  groups: Array<{ heading: string; questions: string[] }>;
}

export interface TabletopSession {
  id: string;
  title: string;
  scenario: string | null;
  status: 'planned' | 'held';
  scheduledFor: string | null;
  heldOn: string | null;
  facilitator: string | null;
  participants: string | null;
  cadenceMonths: number;
  notes: TabletopNote[];
  afterAction: string | null;
}

export interface TabletopData {
  cadence: { cadenceMonths: number; lastHeldOn: string | null; nextDue: string | null; overdue: boolean };
  topics: TabletopTopic[];
  sessions: TabletopSession[];
}

export interface TabletopInput {
  title: string;
  scenario?: string;
  status: 'planned' | 'held';
  scheduledFor?: string;
  heldOn?: string;
  facilitator?: string;
  participants?: string;
  cadenceMonths: number;
  notes: TabletopNote[];
  afterAction?: string;
}

export interface WaterReportQuestion {
  identifier: string;
  question: string;
  function: string;
  priority: boolean;
  goal: string;
  answer: string | null;
  note: string | null;
  justification: string | null;
  answeredAt: string | null;
  evidence: { status: string; owner: string | null; attachments: number } | null;
}

export interface WaterReportData {
  utility: string;
  framework: string;
  generatedAt: string;
  answered: number;
  expected: number;
  functions: Array<{ label: string; yes: number; inProgress: number; no: number; notApplicable: number; unanswered: number; percent: number }>;
  questions: WaterReportQuestion[];
  plans: Array<{ name: string; status: string; filled: number; total: number }>;
  tabletop: {
    cadence: TabletopData['cadence'];
    session: {
      title: string;
      scenario: string | null;
      heldOn: string | null;
      facilitator: string | null;
      participants: string | null;
      afterAction: string | null;
      topics: Array<{ title: string; discussion: string; gaps: string | null }>;
    } | null;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiClient.get<T>(url);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

/** The printable report: assessment, risk mitigation plan, plans and the last tabletop. */
export function useWaterReport(frameworkInstanceId: string) {
  const key = frameworkInstanceId ? `/v1/water-program/${frameworkInstanceId}/report` : null;
  return useSWR<WaterReportData>(key, fetchJson, { revalidateOnFocus: true, shouldRetryOnError: false });
}

/** Evidence tasks of the water framework, one per CPG goal. */
export function useWaterEvidence(frameworkInstanceId: string) {
  const key = frameworkInstanceId ? `/v1/water-program/${frameworkInstanceId}/evidence` : null;
  const { data, error, isLoading, mutate } = useSWR<WaterEvidenceTask[]>(key, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { tasks: data ?? [], error, isLoading, refresh: mutate };
}

/** Tabletop topics, sessions and cadence, with save and delete per session. */
export function useWaterTabletop(frameworkInstanceId: string) {
  const base = `/v1/water-program/${frameworkInstanceId}/tabletop`;
  const { data, error, isLoading, mutate } = useSWR<TabletopData>(frameworkInstanceId ? base : null, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const save = useCallback(
    async (sessionId: string | null, input: TabletopInput) => {
      const res = sessionId
        ? await apiClient.put<TabletopData>(`${base}/${sessionId}`, input)
        : await apiClient.post<TabletopData>(base, input);
      if (res.error || !res.data) throw new Error(res.error ?? 'Could not save the session');
      await mutate(res.data, { revalidate: false });
      return res.data;
    },
    [base, mutate],
  );

  const remove = useCallback(
    async (sessionId: string) => {
      const res = await apiClient.delete<TabletopData>(`${base}/${sessionId}`);
      if (res.error) throw new Error(res.error);
      await mutate();
    },
    [base, mutate],
  );

  return { data, error, isLoading, save, remove };
}
