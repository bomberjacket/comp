import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import {
  SENTINEL_API,
  loadSentinelWorkspaces,
  unverified,
  workspaceEvidence,
  workspaceUrl,
} from './sentinel-shared';
import { armListAll } from './shared';

interface Incident {
  id: string;
  name: string;
  properties?: {
    title?: string;
    severity?: string;
    status?: string;
    incidentNumber?: number;
    incidentUrl?: string;
    createdTimeUtc?: string;
    lastModifiedTimeUtc?: string;
    owner?: { assignedTo?: string; email?: string; userPrincipalName?: string } | null;
    additionalData?: { alertsCount?: number; alertProductNames?: string[]; tactics?: string[] };
    relatedAnalyticRuleIds?: string[];
  };
}

const SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  informational: 'low',
};

const daysSince = (iso: string | undefined, now: number): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
};

/** 3.6.2[a] Incidents are tracked. */
export const sentinelOpenIncidentsCheck: IntegrationCheck = {
  id: 'sentinel-open-incidents',
  name: 'Open Sentinel incidents (3.6.2)',
  description:
    'Lists the incidents in each Sentinel workspace that are still New or Active, with severity, age, owner and alert count. An empty queue is the pass; every open incident is a finding. Evidence for 3.6.2[a].',
  service: 'sentinel',
  taskMapping: TASK_TEMPLATES['3.6.2[a]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const workspaces = await loadSentinelWorkspaces(ctx);
    if (!workspaces) return;
    const now = Date.now();

    for (const w of workspaces) {
      const ws = w.workspace;
      let incidents: Incident[];
      try {
        const filter = encodeURIComponent("properties/status ne 'Closed'");
        const order = encodeURIComponent('properties/createdTimeUtc desc');
        incidents = await armListAll<Incident>(
          ctx,
          `${workspaceUrl(ws, 'providers/Microsoft.SecurityInsights/incidents', SENTINEL_API)}&$filter=${filter}&$orderby=${order}&$top=1000`,
        );
      } catch (err) {
        unverified(ctx, `Sentinel incidents in ${ws.name}`, ws.name, err);
        continue;
      }
      ctx.log(`${ws.name}: ${incidents.length} open incidents`);

      if (incidents.length === 0) {
        ctx.pass({
          title: `No open incidents: ${ws.name}`,
          description: `Sentinel in ${ws.name} has no New or Active incidents; incidents are tracked in the SIEM and the queue is clear.`,
          resourceType: 'log-analytics-workspace',
          resourceId: ws.name,
          evidence: {
            ...workspaceEvidence(w),
            openIncidents: 0,
            checkedAt: new Date(now).toISOString(),
          },
        });
        continue;
      }

      for (const inc of incidents) {
        const p = inc.properties ?? {};
        const age = daysSince(p.createdTimeUtc, now);
        const owner = p.owner?.userPrincipalName || p.owner?.email || p.owner?.assignedTo || null;
        const number = p.incidentNumber ?? inc.name;
        ctx.fail({
          title: `Open incident #${number} (${p.severity ?? 'unknown'}): ${p.title ?? 'untitled'}`,
          description: `${p.status ?? 'Open'} in ${ws.name}, opened ${age ?? '?'} days ago, ${owner ? `assigned to ${owner}` : 'unassigned'}, ${p.additionalData?.alertsCount ?? 0} alert(s)${p.additionalData?.alertProductNames?.length ? ` from ${p.additionalData.alertProductNames.join(', ')}` : ''}.`,
          resourceType: 'sentinel-incident',
          resourceId: `${ws.name}/${number}`,
          severity: SEVERITY[(p.severity ?? '').toLowerCase()] ?? 'low',
          remediation:
            'Assign an owner, investigate under the incident response plan (3.6.1), record the outcome and close the incident with a classification.',
          evidence: {
            ...workspaceEvidence(w),
            incidentId: inc.name,
            incidentNumber: p.incidentNumber ?? null,
            title: p.title ?? null,
            severity: p.severity ?? null,
            status: p.status ?? null,
            owner,
            createdTimeUtc: p.createdTimeUtc ?? null,
            lastModifiedTimeUtc: p.lastModifiedTimeUtc ?? null,
            ageDays: age,
            alertsCount: p.additionalData?.alertsCount ?? null,
            alertProducts: p.additionalData?.alertProductNames ?? [],
            tactics: p.additionalData?.tactics ?? [],
            incidentUrl: p.incidentUrl ?? null,
          },
        });
      }
    }
  },
};
