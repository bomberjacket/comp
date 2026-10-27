import type { CheckContext, CheckVariable, CheckVariableValues } from '../../../types';
import { remediationForReadFailure, toHttpReadFailure } from '../../http-read-failure';
import { ARM_BASE, armListAll, resolveAzureSubscriptionIds } from './shared';

export const LOG_ANALYTICS_API = '2023-09-01';
export const SENTINEL_API = '2024-03-01';

export interface LogAnalyticsWorkspace {
  id: string;
  name: string;
  location?: string;
  properties?: {
    retentionInDays?: number;
    sku?: { name?: string };
    customerId?: string;
    provisioningState?: string;
  };
}

export interface SentinelWorkspace {
  subscriptionId: string;
  workspace: LogAnalyticsWorkspace;
  /** True when Microsoft Sentinel is onboarded on the workspace. */
  sentinel: boolean;
}

/** Same id as the Microsoft 365 manifest's variable, so a client sets one number. */
export const sentinelRetentionDaysVariable: CheckVariable = {
  id: 'audit_retention_days',
  label: 'Audit record retention (days)',
  type: 'number',
  required: false,
  default: 365,
  helpText:
    'The retention period defined for 3.3.1. Log Analytics / Sentinel table retention (interactive plus archive) is compared with it.',
};

export function parseRetentionDays(variables: CheckVariableValues): number {
  const n = Number(variables.audit_retention_days);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 365;
}

/** Build an ARM URL under a workspace resource id. */
export function workspaceUrl(
  ws: LogAnalyticsWorkspace,
  suffix: string,
  apiVersion: string,
): string {
  return `${ARM_BASE}${ws.id}/${suffix}?api-version=${apiVersion}`;
}

/** Emit the shared "could not verify" finding for an ARM read that threw. */
export function unverified(
  ctx: CheckContext,
  what: string,
  resourceId: string,
  err: unknown,
  hint = 'Grant the connection Reader on the subscription and Microsoft Sentinel Reader on the workspace, then re-run the check.',
): void {
  const failure = toHttpReadFailure(err);
  ctx.fail({
    title: `Could not verify ${what}`,
    description: `${what} could not be read from Azure (${failure.error}), so this check is unverified.`,
    resourceType: 'log-analytics-workspace',
    resourceId,
    severity: 'medium',
    remediation: remediationForReadFailure(failure, hint),
    evidence: { readError: failure.error },
  });
}

// ---------------------------------------------------------------------------
// Workspace discovery, cached per connection for the length of a scan: every
// Sentinel check needs the same workspace list and onboarding state, and the
// runner gives each check a fresh context.
// ---------------------------------------------------------------------------

type WorkspaceLoad =
  | { ok: true; workspaces: SentinelWorkspace[] }
  | { ok: false; subscriptionId: string; error: unknown };

const CACHE_TTL_MS = 10 * 60_000;
const workspaceCache = new Map<string, { at: number; promise: Promise<WorkspaceLoad> }>();

/** Test hook: forget cached reads between test cases. */
export function resetSentinelCache(): void {
  workspaceCache.clear();
}

async function readWorkspaces(ctx: CheckContext, subs: string[]): Promise<WorkspaceLoad> {
  const out: SentinelWorkspace[] = [];
  for (const sub of subs) {
    let list: LogAnalyticsWorkspace[];
    try {
      list = await armListAll<LogAnalyticsWorkspace>(
        ctx,
        `${ARM_BASE}/subscriptions/${sub}/providers/Microsoft.OperationalInsights/workspaces?api-version=${LOG_ANALYTICS_API}`,
      );
    } catch (error) {
      return { ok: false, subscriptionId: sub, error };
    }
    for (const workspace of list) {
      let sentinel = false;
      try {
        const states = await ctx.fetch<{ value?: unknown[] }>(
          workspaceUrl(
            workspace,
            'providers/Microsoft.SecurityInsights/onboardingStates',
            SENTINEL_API,
          ),
        );
        sentinel = (states.value ?? []).length > 0;
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        if (status !== 404) {
          ctx.warn(`Could not read Sentinel onboarding state for ${workspace.name}`, {
            error: String(err),
          });
        }
      }
      out.push({ subscriptionId: sub, workspace, sentinel });
    }
  }
  return { ok: true, workspaces: out };
}

/**
 * Every Log Analytics workspace in the scanned subscriptions with its Sentinel
 * onboarding flag, or null after a "could not verify" finding.
 */
export async function loadWorkspaces(ctx: CheckContext): Promise<SentinelWorkspace[] | null> {
  const subs = await resolveAzureSubscriptionIds(ctx);
  if (subs.length === 0) return null;

  const key = `${ctx.organizationId}:${ctx.connectionId}:${[...subs].sort().join(',')}`;
  const hit = workspaceCache.get(key);
  let promise: Promise<WorkspaceLoad>;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    ctx.log('Reusing the workspace list read earlier in this scan');
    promise = hit.promise;
  } else {
    promise = readWorkspaces(ctx, subs);
    workspaceCache.set(key, { at: Date.now(), promise });
  }

  const load = await promise;
  if (!load.ok) {
    workspaceCache.delete(key);
    unverified(
      ctx,
      'Log Analytics workspaces',
      load.subscriptionId,
      load.error,
      'Grant the connection Reader on the subscription, then re-run the check.',
    );
    return null;
  }
  ctx.log(
    `Workspaces: ${load.workspaces.length}, with Sentinel: ${load.workspaces.filter((w) => w.sentinel).length}`,
  );
  return load.workspaces;
}

/** Sentinel-enabled workspaces, or null after a finding when there are none. */
export async function loadSentinelWorkspaces(
  ctx: CheckContext,
): Promise<SentinelWorkspace[] | null> {
  const all = await loadWorkspaces(ctx);
  if (!all) return null;
  const sentinel = all.filter((w) => w.sentinel);
  if (sentinel.length === 0) {
    ctx.fail({
      title: 'No Microsoft Sentinel workspace found',
      description: `${all.length} Log Analytics workspace(s) are visible in the scanned subscriptions and none has Microsoft Sentinel enabled, so SIEM evidence cannot be collected.`,
      resourceType: 'azure-subscription',
      resourceId: 'sentinel',
      severity: 'medium',
      remediation:
        'Enable Microsoft Sentinel on the workspace that receives the Entra, Office 365 and Defender logs, or select the subscription that holds it in the integration settings.',
      evidence: { workspaces: all.map((w) => w.workspace.name) },
    });
    return null;
  }
  return sentinel;
}

export function workspaceEvidence(w: SentinelWorkspace): Record<string, unknown> {
  return {
    workspaceId: w.workspace.id,
    workspaceName: w.workspace.name,
    subscriptionId: w.subscriptionId,
    location: w.workspace.location ?? null,
    sku: w.workspace.properties?.sku?.name ?? null,
    retentionInDays: w.workspace.properties?.retentionInDays ?? null,
    sentinelEnabled: w.sentinel,
  };
}
