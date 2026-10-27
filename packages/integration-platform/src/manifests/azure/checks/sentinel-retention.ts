import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import {
  LOG_ANALYTICS_API,
  loadWorkspaces,
  parseRetentionDays,
  sentinelRetentionDaysVariable,
  workspaceEvidence,
  workspaceUrl,
  type SentinelWorkspace,
} from './sentinel-shared';
import { armListAll } from './shared';

interface WorkspaceTable {
  name: string;
  properties?: {
    retentionInDays?: number;
    totalRetentionInDays?: number;
    archiveRetentionInDays?: number;
    plan?: string;
    retentionInDaysAsDefault?: boolean;
    totalRetentionInDaysAsDefault?: boolean;
  };
}

/** Tables that hold 800-171 audit evidence when present in a workspace. */
export const AUDIT_TABLES = [
  'SigninLogs',
  'AuditLogs',
  'NonInteractiveUserSignInLogs',
  'OfficeActivity',
  'SecurityAlert',
  'SecurityIncident',
  'SecurityEvent',
  'DeviceEvents',
  'CommonSecurityLog',
  'Syslog',
  'AzureActivity',
];

/** Total retention of a table: archive included, falling back to the workspace default. */
export function tableRetention(t: WorkspaceTable, workspaceDefault: number | null): number | null {
  const p = t.properties ?? {};
  if (typeof p.totalRetentionInDays === 'number' && p.totalRetentionInDays > 0)
    return p.totalRetentionInDays;
  if (typeof p.retentionInDays === 'number' && p.retentionInDays > 0) return p.retentionInDays;
  return workspaceDefault;
}

async function evaluateWorkspace(
  ctx: CheckContext,
  w: SentinelWorkspace,
  required: number,
): Promise<void> {
  const ws = w.workspace;
  const workspaceDefault = ws.properties?.retentionInDays ?? null;
  let tables: WorkspaceTable[] = [];
  try {
    tables = await armListAll<WorkspaceTable>(ctx, workspaceUrl(ws, 'tables', LOG_ANALYTICS_API));
  } catch (err) {
    ctx.warn(`Could not list tables for ${ws.name}; using the workspace default only`, {
      error: String(err),
    });
  }
  const auditTables = tables.filter((t) => AUDIT_TABLES.includes(t.name));
  ctx.log(
    `${ws.name}: default retention ${workspaceDefault ?? '?'} days, ${auditTables.length} audit tables`,
  );

  for (const t of auditTables) {
    const total = tableRetention(t, workspaceDefault);
    const evidence = {
      ...workspaceEvidence(w),
      table: t.name,
      plan: t.properties?.plan ?? null,
      interactiveRetentionDays: t.properties?.retentionInDays ?? null,
      archiveRetentionDays: t.properties?.archiveRetentionInDays ?? null,
      totalRetentionDays: total,
      definedRetentionDays: required,
    };
    const id = `${ws.name}/${t.name}`;
    if (total !== null && total >= required) {
      ctx.pass({
        title: `${t.name} retained ${total} days (defined ${required}): ${ws.name}`,
        description: `${t.name} in ${ws.name} keeps ${total} days in total${t.properties?.archiveRetentionInDays ? `, ${t.properties.archiveRetentionInDays} of them archived` : ''}.`,
        resourceType: 'log-analytics-table',
        resourceId: id,
        evidence,
      });
    } else {
      ctx.fail({
        title: `${t.name} retained ${total ?? 'unknown'} days, defined ${required}: ${ws.name}`,
        description: `${t.name} in ${ws.name} keeps ${total ?? 'an unknown number of'} days, short of the ${required}-day retention period.`,
        resourceType: 'log-analytics-table',
        resourceId: id,
        severity: 'medium',
        remediation: `Raise the table's total retention to at least ${required} days (Log Analytics workspace, Tables, Manage table; archive tiers keep the cost down), or raise the workspace default.`,
        evidence,
      });
    }
  }

  const wsEvidence = {
    ...workspaceEvidence(w),
    definedRetentionDays: required,
    auditTablesFound: auditTables.map((t) => t.name),
  };
  if (workspaceDefault !== null && workspaceDefault >= required) {
    ctx.pass({
      title: `Workspace default retention ${workspaceDefault} days: ${ws.name}`,
      description: `Tables without their own setting in ${ws.name} inherit ${workspaceDefault} days.`,
      resourceType: 'log-analytics-workspace',
      resourceId: ws.name,
      evidence: wsEvidence,
    });
  } else {
    ctx.fail({
      title: `Workspace default retention ${workspaceDefault ?? 'unknown'} days, defined ${required}: ${ws.name}`,
      description: `Tables in ${ws.name} without their own retention setting inherit ${workspaceDefault ?? 'an unknown'} default, below the ${required}-day period.`,
      resourceType: 'log-analytics-workspace',
      resourceId: ws.name,
      severity: auditTables.length > 0 ? 'low' : 'medium',
      remediation: `Set the workspace default retention to ${required} days, or set table-level total retention on every audit table (the table findings above list them).`,
      evidence: wsEvidence,
    });
  }
}

/** 3.3.1[f] Audit records are retained as defined (Log Analytics / Sentinel side). */
export const sentinelLogRetentionCheck: IntegrationCheck = {
  id: 'sentinel-log-retention',
  name: 'Sentinel log retention (3.3.1)',
  description:
    'Compares the total retention (interactive plus archive) of the audit tables in each Sentinel workspace (sign-in, audit, Office 365, security alerts and incidents, Windows security events, ...) with the retention period defined for 3.3.1. Evidence for 3.3.1[f]; this is the evidence that closes the 30-day Entra ID limit reported by the Microsoft 365 integration.',
  service: 'sentinel',
  taskMapping: TASK_TEMPLATES['3.3.1[f]'],
  defaultSeverity: 'medium',
  variables: [sentinelRetentionDaysVariable],

  run: async (ctx) => {
    const required = parseRetentionDays(ctx.variables);
    const all = await loadWorkspaces(ctx);
    if (!all) return;
    if (all.length === 0) {
      ctx.fail({
        title: 'No Log Analytics workspace found',
        description:
          'The scanned subscriptions hold no Log Analytics workspace, so no exported audit log retention can be measured.',
        resourceType: 'azure-subscription',
        resourceId: 'log-analytics',
        severity: 'medium',
        remediation:
          'Create a Log Analytics workspace (with Microsoft Sentinel) and route Entra, Office 365 and Defender logs to it, or select the subscription that holds it.',
      });
      return;
    }
    // Sentinel workspaces carry the audit evidence; without Sentinel, every workspace is reviewed.
    const sentinel = all.filter((w) => w.sentinel);
    const targets = sentinel.length > 0 ? sentinel : all;
    for (const w of targets) await evaluateWorkspace(ctx, w, required);
  },
};
