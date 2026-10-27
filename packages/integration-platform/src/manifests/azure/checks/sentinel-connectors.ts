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

interface DataConnector {
  id: string;
  name: string;
  kind: string;
  properties?: {
    tenantId?: string;
    subscriptionId?: string;
    dataTypes?: Record<string, { state?: string } | undefined>;
  };
}

const KIND_LABEL: Record<string, string> = {
  Office365: 'Office 365 (Exchange, SharePoint, Teams)',
  AzureActiveDirectory: 'Entra ID Protection alerts',
  AzureActiveDirectoryIdentityProtection: 'Entra ID Protection alerts',
  MicrosoftDefenderAdvancedThreatProtection: 'Defender for Endpoint alerts',
  MicrosoftThreatProtection: 'Defender XDR incidents and alerts',
  AzureSecurityCenter: 'Defender for Cloud alerts',
  MicrosoftCloudAppSecurity: 'Defender for Cloud Apps',
  AzureAdvancedThreatProtection: 'Defender for Identity alerts',
  ThreatIntelligence: 'Threat intelligence indicators',
  ThreatIntelligenceTaxii: 'Threat intelligence (TAXII)',
  AmazonWebServicesCloudTrail: 'AWS CloudTrail',
  Office365Project: 'Microsoft Project',
  OfficePowerBI: 'Power BI',
  OfficeIRM: 'Office 365 insider risk',
  IOT: 'Defender for IoT',
  Dynamics365: 'Dynamics 365',
  GenericUI: 'Custom connector',
  APIPolling: 'API polling connector',
};

/** Sources a CUI enclave on Microsoft 365 is expected to feed into the SIEM. */
const EXPECTED: Array<{ label: string; kinds: string[]; remediation: string }> = [
  {
    label: 'Office 365 activity (Exchange, SharePoint, Teams)',
    kinds: ['Office365'],
    remediation:
      'Connect the Office 365 data connector in Sentinel with Exchange, SharePoint and Teams enabled so OfficeActivity records are retained and correlated.',
  },
  {
    label: 'Defender alerts (Defender XDR or Defender for Endpoint)',
    kinds: ['MicrosoftThreatProtection', 'MicrosoftDefenderAdvancedThreatProtection'],
    remediation:
      'Connect the Microsoft Defender XDR data connector (or Defender for Endpoint) so endpoint alerts and incidents reach the SIEM.',
  },
];

export function enabledDataTypes(c: DataConnector): string[] {
  return Object.entries(c.properties?.dataTypes ?? {})
    .filter(([, v]) => (v?.state ?? '').toLowerCase() === 'enabled')
    .map(([k]) => k)
    .sort();
}

/** 3.3.5[b] Defined audit record review, analysis and reporting processes are correlated. */
export const sentinelDataConnectorsCheck: IntegrationCheck = {
  id: 'sentinel-data-connectors',
  name: 'Sentinel data connectors (3.3.5)',
  description:
    'Lists the data connectors feeding each Sentinel workspace and which data types are enabled, and flags missing Office 365 and Defender sources. Entra ID sign-in and audit logs arrive through tenant diagnostic settings, which the "Entra ID log export" check covers. Evidence for 3.3.5[b].',
  service: 'sentinel',
  taskMapping: TASK_TEMPLATES['3.3.5[b]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const workspaces = await loadSentinelWorkspaces(ctx);
    if (!workspaces) return;

    for (const w of workspaces) {
      const ws = w.workspace;
      let connectors: DataConnector[];
      try {
        connectors = await armListAll<DataConnector>(
          ctx,
          workspaceUrl(
            ctx,
            ws,
            'providers/Microsoft.SecurityInsights/dataConnectors',
            SENTINEL_API,
          ),
        );
      } catch (err) {
        unverified(ctx, `Sentinel data connectors in ${ws.name}`, ws.name, err);
        continue;
      }
      ctx.log(`${ws.name}: ${connectors.length} data connectors`);

      if (connectors.length === 0) {
        ctx.fail({
          title: `No data connectors: ${ws.name}`,
          description: `Sentinel in ${ws.name} has no data connectors, so no log source is correlated in the SIEM.`,
          resourceType: 'log-analytics-workspace',
          resourceId: ws.name,
          severity: 'high',
          remediation:
            'Connect Office 365, Microsoft Defender XDR and Entra ID (via diagnostic settings) in Sentinel, Data connectors.',
          evidence: workspaceEvidence(w),
        });
        continue;
      }

      const enabledKinds = new Set<string>();
      for (const c of connectors) {
        const types = enabledDataTypes(c);
        const label = KIND_LABEL[c.kind] ?? c.kind;
        const evidence = {
          ...workspaceEvidence(w),
          connectorId: c.name,
          kind: c.kind,
          enabledDataTypes: types,
          allDataTypes: Object.keys(c.properties?.dataTypes ?? {}),
        };
        if (types.length > 0) {
          enabledKinds.add(c.kind);
          ctx.pass({
            title: `Data connector: ${label} (${ws.name})`,
            description: `${label} is connected to ${ws.name} with ${types.join(', ')} enabled.`,
            resourceType: 'sentinel-data-connector',
            resourceId: `${ws.name}/${c.kind}/${c.name}`,
            evidence,
          });
        } else {
          ctx.fail({
            title: `Data connector with nothing enabled: ${label} (${ws.name})`,
            description: `${label} exists in ${ws.name} but every data type is disabled.`,
            resourceType: 'sentinel-data-connector',
            resourceId: `${ws.name}/${c.kind}/${c.name}`,
            severity: 'low',
            remediation: 'Enable the data types on the connector or remove it.',
            evidence,
          });
        }
      }

      for (const exp of EXPECTED) {
        if (exp.kinds.some((k) => enabledKinds.has(k))) continue;
        ctx.fail({
          title: `${exp.label} not connected: ${ws.name}`,
          description: `No enabled connector of kind ${exp.kinds.join(' or ')} feeds ${ws.name}.`,
          resourceType: 'log-analytics-workspace',
          resourceId: `${ws.name}/${exp.kinds[0]}`,
          severity: 'medium',
          remediation: exp.remediation,
          evidence: { ...workspaceEvidence(w), enabledKinds: [...enabledKinds].sort() },
        });
      }
    }
  },
};
