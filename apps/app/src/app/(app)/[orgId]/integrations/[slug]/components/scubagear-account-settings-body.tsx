'use client';

import type { IntegrationProvider } from '@/hooks/use-integration-platform';
import { useIntegrationConnection, useIntegrationMutations } from '@/hooks/use-integration-platform';
import { api } from '@/lib/api-client';
import { Button } from '@trycompai/design-system';
import { compactScubaResults, SCUBA_RESULTS_FIELD } from '@trycompai/integration-platform';
import { Badge } from '@trycompai/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AccountSettingsInfoRow, AccountSettingsSection } from './account-settings-shared-ui';

const ENVIRONMENT_LABELS: Record<string, string> = {
  commercial: 'Commercial',
  gcc: 'GCC',
  gcchigh: 'GCC High',
  dod: 'DoD',
};

function formatDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? undefined
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Settings for a ScubaGear connection: shows the uploaded report and takes a
 * new ScubaResults_<uuid>.json. The file is compacted in the browser (the raw
 * tenant export is dropped), stored as the connection's credential, and the
 * checks are run straight away.
 */
export function ScubaGearAccountSettingsBody({
  open,
  connectionId,
  onUpdated,
}: {
  open: boolean;
  connectionId: string;
  provider: IntegrationProvider;
  onUpdated?: () => void;
}) {
  const { connection, isLoading, refresh } = useIntegrationConnection(open ? connectionId : null);
  const { updateConnectionCredentials, updateConnectionMetadata, deleteConnection } =
    useIntegrationMutations();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const metadata = (connection?.metadata ?? {}) as Record<string, unknown>;
  const reportId = typeof metadata.scubaReportId === 'string' ? metadata.scubaReportId : undefined;
  const environment = typeof metadata.environment === 'string' ? metadata.environment : undefined;

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const compact = compactScubaResults(JSON.parse(await file.text()));
        const saved = await updateConnectionCredentials(connectionId, {
          [SCUBA_RESULTS_FIELD]: JSON.stringify(compact),
        });
        if (!saved.success) {
          toast.error(saved.error || 'Failed to store the report');
          return;
        }
        await updateConnectionMetadata(connectionId, {
          scubaReportId: compact.meta.reportId,
          scubaReportTimestamp: compact.meta.timestamp,
          scubaToolVersion: compact.meta.toolVersion,
          scubaTenantId: compact.meta.tenantId,
          scubaDomainName: compact.meta.domainName,
          scubaProducts: compact.meta.productsAssessed,
          scubaPolicyCount: compact.policies.length,
          scubaUploadedAt: new Date().toISOString(),
        });
        // Run every policy check against the evidence tasks it maps to, so the
        // results and status changes show on each task's page (the daily
        // schedule's path, run now).
        const run = await api.post<{ tasksRun: number; tasksFailed: number; tasksDone: number }>(
          `/v1/integrations/tasks/run-connection/${connectionId}`,
          {},
        );
        if (run.error || !run.data) {
          toast.warning(`Report stored, but the checks did not run: ${run.error ?? 'no response'}`);
        } else {
          toast.success(
            `Report stored (${compact.policies.length} policies). ${run.data.tasksRun} evidence tasks checked: ${run.data.tasksFailed} failed, ${run.data.tasksDone} done.`,
          );
        }
        await refresh();
        onUpdated?.();
      } catch (err) {
        toast.error(err instanceof Error ? `Not a ScubaGear results file: ${err.message}` : 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInput.current) fileInput.current.value = '';
      }
    },
    [connectionId, onUpdated, refresh, updateConnectionCredentials, updateConnectionMetadata],
  );

  const handleDisconnect = useCallback(async () => {
    if (!confirm('Remove this connection and its stored ScubaGear report?')) return;
    setDisconnecting(true);
    try {
      const result = await deleteConnection(connectionId);
      if (result.success) {
        toast.success('Disconnected');
        onUpdated?.();
      } else toast.error(result.error || 'Failed');
    } catch {
      toast.error('Failed');
    } finally {
      setDisconnecting(false);
    }
  }, [connectionId, deleteConnection, onUpdated]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 py-5">
      <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1">
        <AccountSettingsInfoRow
          label="Status"
          badge={
            connection?.status === 'active' ? (
              <Badge
                variant="outline"
                className="gap-1 text-[9px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                {connection?.status}
              </Badge>
            )
          }
        />
        {typeof metadata.connectionName === 'string' && (
          <AccountSettingsInfoRow label="Name" value={metadata.connectionName} />
        )}
        {environment && (
          <AccountSettingsInfoRow label="Environment" value={ENVIRONMENT_LABELS[environment] ?? environment} />
        )}
        {connection?.createdAt && (
          <AccountSettingsInfoRow label="Created" value={formatDate(connection.createdAt)} />
        )}
      </div>

      <AccountSettingsSection label="ScubaGear report">
        {reportId ? (
          <div className="rounded-md border px-3 py-2.5 space-y-1">
            {typeof metadata.scubaDomainName === 'string' && (
              <AccountSettingsInfoRow label="Tenant" value={metadata.scubaDomainName} mono />
            )}
            <AccountSettingsInfoRow label="Run on" value={formatDate(metadata.scubaReportTimestamp)} />
            {typeof metadata.scubaToolVersion === 'string' && (
              <AccountSettingsInfoRow label="ScubaGear" value={metadata.scubaToolVersion} />
            )}
            {Array.isArray(metadata.scubaProducts) && (
              <div className="py-1">
                <p className="text-xs text-muted-foreground">Products</p>
                <p className="text-xs">{(metadata.scubaProducts as string[]).join(', ')}</p>
              </div>
            )}
            {typeof metadata.scubaPolicyCount === 'number' && (
              <AccountSettingsInfoRow label="Policies" value={String(metadata.scubaPolicyCount)} />
            )}
            <AccountSettingsInfoRow label="Uploaded" value={formatDate(metadata.scubaUploadedAt)} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No report uploaded yet. Run Invoke-SCuBA on a Windows host and upload the
            ScubaResults_&lt;uuid&gt;.json it writes.
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          onClick={() => fileInput.current?.click()}
          loading={uploading}
          disabled={uploading}
          size="sm"
          iconLeft={<Upload className="h-3.5 w-3.5" />}
        >
          {reportId ? 'Upload a newer report' : 'Upload ScubaResults JSON'}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Only the report metadata, summary and per-policy results are kept; the raw tenant export in
          the file is dropped before it is stored. Uploading runs the checks again.
        </p>
      </AccountSettingsSection>

      <div className="rounded-md border border-destructive/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <div>
              <p className="text-xs font-medium">Disconnect</p>
              <p className="text-[10px] text-muted-foreground">Remove this connection and its report</p>
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={() => void handleDisconnect()}
            loading={disconnecting}
            disabled={disconnecting}
            size="sm"
          >
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  );
}
