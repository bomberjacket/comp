import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import { daysSince, graphListAllOrFail } from '../graph';
import type { GraphSecurityAlert } from '../types';

const ALERT_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  informational: 'low',
};

const SERVICE_LABEL: Record<string, string> = {
  microsoftDefenderForEndpoint: 'Defender for Endpoint',
  microsoftDefenderForIdentity: 'Defender for Identity',
  microsoftDefenderForCloudApps: 'Defender for Cloud Apps',
  microsoftDefenderForOffice365: 'Defender for Office 365',
  microsoft365Defender: 'Defender XDR',
  azureAdIdentityProtection: 'Entra ID Protection',
  microsoftDefenderForCloud: 'Defender for Cloud',
};

export function alertAssets(a: GraphSecurityAlert): { devices: string[]; users: string[] } {
  const devices = new Set<string>();
  const users = new Set<string>();
  for (const ev of a.evidence ?? []) {
    if (ev.deviceDnsName) devices.add(ev.deviceDnsName);
    if (ev.userAccount?.userPrincipalName) users.add(ev.userAccount.userPrincipalName);
  }
  return { devices: [...devices].sort(), users: [...users].sort() };
}

/** 3.14.6[a] The system is monitored to detect attacks and indicators of potential attacks. */
export const defenderOpenAlertsCheck: IntegrationCheck = {
  id: 'defender-open-alerts',
  name: 'Open Defender alerts (3.14.6)',
  description:
    'Reads alerts from Defender XDR (Defender for Endpoint, Identity, Office 365, Cloud Apps and Entra ID Protection) that are still new or in progress. Every open alert is a finding; an empty queue is the pass. Evidence for 3.14.6[a].',
  service: 'defender-endpoint',
  taskMapping: TASK_TEMPLATES['3.14.6[a]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const alerts = await graphListAllOrFail<GraphSecurityAlert>(ctx, '/v1.0/security/alerts_v2', {
      what: 'Defender alerts',
      resourceType: 'tenant',
      permission:
        'SecurityAlert.Read.All (the tenant also needs Defender for Endpoint, Defender for Business or another Defender XDR licence)',
      params: { $filter: "status eq 'new' or status eq 'inProgress'" },
    });
    if (!alerts) return;
    ctx.log(`Open Defender alerts: ${alerts.length}`);

    if (alerts.length === 0) {
      ctx.pass({
        title: 'No open Defender alerts',
        description:
          'Defender XDR has no alerts in the new or in-progress state; monitoring is connected and the queue is clear.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        evidence: { openAlerts: 0, checkedAt: new Date().toISOString() },
      });
      return;
    }

    const now = Date.now();
    for (const a of alerts) {
      const severity = ALERT_SEVERITY[(a.severity ?? '').toLowerCase()] ?? 'low';
      const age = daysSince(a.createdDateTime, now);
      const source = SERVICE_LABEL[a.serviceSource ?? ''] ?? a.serviceSource ?? 'Defender';
      const assets = alertAssets(a);
      ctx.fail({
        title: `Open alert (${a.severity ?? 'unknown'}): ${a.title ?? a.id}`,
        description: `${a.category ?? 'Uncategorised'} alert from ${source}, status ${a.status ?? 'unknown'}, opened ${age ?? '?'} days ago, ${a.assignedTo ? `assigned to ${a.assignedTo}` : 'unassigned'}.${assets.devices.length ? ` Devices: ${assets.devices.join(', ')}.` : ''}`,
        resourceType: 'security-alert',
        resourceId: a.id,
        severity,
        remediation:
          'Investigate in the Defender portal, record the incident under the incident response plan (3.6.1), then resolve or classify the alert.',
        evidence: {
          id: a.id,
          title: a.title ?? null,
          category: a.category ?? null,
          severity: a.severity ?? null,
          status: a.status ?? null,
          serviceSource: a.serviceSource ?? null,
          detectionSource: a.detectionSource ?? null,
          incidentId: a.incidentId ?? null,
          assignedTo: a.assignedTo ?? null,
          classification: a.classification ?? null,
          determination: a.determination ?? null,
          createdDateTime: a.createdDateTime ?? null,
          lastUpdateDateTime: a.lastUpdateDateTime ?? null,
          ageDays: age,
          devices: assets.devices,
          users: assets.users,
        },
      });
    }
  },
};
