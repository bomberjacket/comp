import { serverApi } from '@/lib/api-server';
import { redirect } from 'next/navigation';
import { FrameworkDetailContent } from './components/FrameworkDetailContent';
import type { FrameworkUpdateStatus } from '@/types/framework-versioning';
import type { Nist800171ScoreResult } from '@/types/nist-800-171-score';

interface PageProps {
  params: Promise<{
    orgId: string;
    frameworkInstanceId: string;
  }>;
}

export default async function FrameworkPage({ params }: PageProps) {
  const { orgId: organizationId, frameworkInstanceId } = await params;

  const [frameworkRes, updateStatusRes, scoreRes] = await Promise.all([
    serverApi.get<any>(`/v1/frameworks/${frameworkInstanceId}`),
    serverApi.get<{ data: FrameworkUpdateStatus }>(
      `/v1/frameworks/${frameworkInstanceId}/update-status`,
    ),
    serverApi.get<Nist800171ScoreResult>(
      `/v1/frameworks/${frameworkInstanceId}/nist-800-171-score`,
    ),
  ]);

  if (!frameworkRes.data) {
    redirect(`/${organizationId}/frameworks`);
  }

  return (
    <FrameworkDetailContent
      orgId={organizationId}
      frameworkInstanceId={frameworkInstanceId}
      initialFramework={frameworkRes.data}
      initialUpdateStatus={updateStatusRes.data?.data ?? undefined}
      initialScore={scoreRes.data ?? undefined}
    />
  );
}
