'use client';

import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import useSWR from 'swr';

export interface EnrollmentTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'expired' | 'exhausted' | 'revoked';
  member?: { user?: { name: string | null; email: string } };
}

export interface CreatedEnrollmentToken {
  id: string;
  name: string;
  token: string;
  expiresAt: string;
  maxUses: number;
}

async function fetchTokens(): Promise<EnrollmentTokenSummary[]> {
  const response = await apiClient.get<{ tokens: EnrollmentTokenSummary[] }>(
    '/v1/device-agent/enrollment-tokens',
  );
  if (response.error) throw new Error(response.error);
  return response.data?.tokens ?? [];
}

/** Enrollment tokens for headless (server) agents: list, create, revoke. */
export function useEnrollmentTokens(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<EnrollmentTokenSummary[]>(
    enabled ? ['device-enrollment-tokens'] : null,
    fetchTokens,
    { revalidateOnFocus: false },
  );

  const createToken = useCallback(
    async (input: { name: string; expiresInDays?: number; maxUses?: number }) => {
      const response = await apiClient.post<CreatedEnrollmentToken>(
        '/v1/device-agent/enrollment-tokens',
        input,
      );
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'No token returned');
      }
      await mutate();
      return response.data;
    },
    [mutate],
  );

  const revokeToken = useCallback(
    async (tokenId: string) => {
      const response = await apiClient.delete(`/v1/device-agent/enrollment-tokens/${tokenId}`);
      if (response.error) throw new Error(response.error);
      await mutate();
    },
    [mutate],
  );

  return { tokens: data ?? [], error, isLoading, createToken, revokeToken };
}
