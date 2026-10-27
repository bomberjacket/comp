import { beforeEach, describe, expect, it } from 'bun:test';
import { TASK_TEMPLATES } from '../../../../task-mappings';
import type {
  CheckContext,
  CheckFindingResult,
  CheckPassingResult,
  CheckVariableValues,
  IntegrationCheck,
} from '../../../../types';
import { azureManifest } from '../../index';
import { entraLogExportCheck, exportedCategories } from '../entra-log-export';
import { sentinelDataConnectorsCheck } from '../sentinel-connectors';
import { sentinelOpenIncidentsCheck } from '../sentinel-incidents';
import { sentinelLogRetentionCheck, tableRetention } from '../sentinel-retention';
import { sentinelAnalyticsRulesCheck, sentinelDetectionCapabilityCheck } from '../sentinel-rules';
import { resetSentinelCache } from '../sentinel-shared';

type RouteValue = Record<string, unknown> | Error;
type Routes = Record<string, RouteValue>;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const denied = Object.assign(new Error('HTTP 403: AuthorizationFailed'), { status: 403 });
const notFound = Object.assign(new Error('HTTP 404: NotFound'), { status: 404 });

const SUB = 'sub-1';
const WS_ID = `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/law-sec`;
const ARM = 'https://management.azure.com';
const WORKSPACES = `${ARM}/subscriptions/${SUB}/providers/Microsoft.OperationalInsights/workspaces`;
const ONBOARDING = `${ARM}${WS_ID}/providers/Microsoft.SecurityInsights/onboardingStates`;
const TABLES = `${ARM}${WS_ID}/tables`;
const CONNECTORS = `${ARM}${WS_ID}/providers/Microsoft.SecurityInsights/dataConnectors`;
const RULES = `${ARM}${WS_ID}/providers/Microsoft.SecurityInsights/alertRules`;
const INCIDENTS = `${ARM}${WS_ID}/providers/Microsoft.SecurityInsights/incidents`;
const AADIAM = `${ARM}/providers/microsoft.aadiam/diagnosticSettings`;

const workspace = (retentionInDays = 90) => ({
  value: [
    {
      id: WS_ID,
      name: 'law-sec',
      location: 'usgovvirginia',
      properties: { retentionInDays, sku: { name: 'PerGB2018' } },
    },
  ],
});
const onboarded = { value: [{ name: 'default' }] };

/** Longest matching URL prefix wins; `?api-version` and query strings are ignored for matching. */
async function run(
  check: IntegrationCheck,
  routes: Routes,
  variables: CheckVariableValues = { subscription_id: SUB },
) {
  const passed: CheckPassingResult[] = [];
  const failed: CheckFindingResult[] = [];
  const calls: string[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const ctx = {
    accessToken: 'tok',
    credentials: {},
    variables,
    connectionId: 'c',
    organizationId: 'o',
    metadata: {},
    log: () => {},
    warn: () => {},
    error: () => {},
    pass: (r: CheckPassingResult) => passed.push(r),
    fail: (r: CheckFindingResult) => failed.push(r),
    fetch: async (url: string) => {
      calls.push(url);
      const key = keys.find((k) => url === k || url.startsWith(`${k}?`) || url.startsWith(`${k}/`));
      if (!key) throw Object.assign(new Error(`HTTP 404: no route for ${url}`), { status: 404 });
      const v = routes[key];
      if (v instanceof Error) throw v;
      return v;
    },
  } as unknown as CheckContext;
  await check.run(ctx);
  return { passed, failed, calls };
}

beforeEach(() => resetSentinelCache());

describe('Azure manifest (Sentinel)', () => {
  it('adds the Sentinel service, the retention variable and six checks mapped to 800-171 objectives', () => {
    expect(azureManifest.services?.find((s) => s.id === 'sentinel')?.implemented).toBe(true);
    expect(azureManifest.variables?.map((v) => v.id)).toContain('audit_retention_days');
    const mapping = Object.fromEntries(
      (azureManifest.checks ?? [])
        .filter((c) => c.service === 'sentinel')
        .map((c) => [c.id, c.taskMapping]),
    );
    expect(mapping).toEqual({
      'sentinel-log-retention': TASK_TEMPLATES['3.3.1[f]'],
      'entra-log-export': TASK_TEMPLATES['3.3.1[f]'],
      'sentinel-data-connectors': TASK_TEMPLATES['3.3.5[b]'],
      'sentinel-analytics-rules': TASK_TEMPLATES['3.14.6[a]'],
      'sentinel-detection-capability': TASK_TEMPLATES['3.6.1[c]'],
      'sentinel-open-incidents': TASK_TEMPLATES['3.6.2[a]'],
    });
  });
});

describe('sentinelLogRetentionCheck', () => {
  const tables = {
    value: [
      {
        name: 'SigninLogs',
        properties: {
          retentionInDays: 90,
          totalRetentionInDays: 730,
          archiveRetentionInDays: 640,
          plan: 'Analytics',
        },
      },
      {
        name: 'AuditLogs',
        properties: { retentionInDays: 90, totalRetentionInDays: 90, plan: 'Analytics' },
      },
      { name: 'OfficeActivity', properties: { retentionInDays: -1, totalRetentionInDays: -1 } },
      { name: 'Heartbeat', properties: { retentionInDays: 30, totalRetentionInDays: 30 } },
    ],
  };

  it('scores each audit table on total retention and the workspace default separately', async () => {
    const { passed, failed } = await run(sentinelLogRetentionCheck, {
      [WORKSPACES]: workspace(90),
      [ONBOARDING]: onboarded,
      [TABLES]: tables,
    });
    expect(passed.map((p) => p.resourceId)).toEqual(['law-sec/SigninLogs']);
    expect(failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['law-sec/AuditLogs', 'medium'],
      ['law-sec/OfficeActivity', 'medium'],
      ['law-sec', 'low'],
    ]);
    expect(failed[1].evidence?.totalRetentionDays).toBe(90);
    expect(
      tableRetention(
        { name: 'x', properties: { totalRetentionInDays: -1, retentionInDays: -1 } },
        400,
      ),
    ).toBe(400);
  });

  it('passes everything when the defined period fits, and reviews plain workspaces when Sentinel is absent', async () => {
    const a = await run(
      sentinelLogRetentionCheck,
      { [WORKSPACES]: workspace(90), [ONBOARDING]: onboarded, [TABLES]: tables },
      { subscription_id: SUB, audit_retention_days: 90 },
    );
    expect(a.failed).toHaveLength(0);
    expect(a.passed).toHaveLength(4);

    resetSentinelCache();
    const b = await run(sentinelLogRetentionCheck, {
      [WORKSPACES]: workspace(400),
      [ONBOARDING]: notFound,
      [TABLES]: { value: [] },
    });
    expect(b.passed.map((p) => p.title)).toEqual(['Workspace default retention 400 days: law-sec']);
    expect(b.failed).toHaveLength(0);
  });

  it('reports no workspace and unreadable workspaces distinctly', async () => {
    const none = await run(sentinelLogRetentionCheck, { [WORKSPACES]: { value: [] } });
    expect(none.failed.map((f) => f.title)).toEqual(['No Log Analytics workspace found']);

    resetSentinelCache();
    const blocked = await run(sentinelLogRetentionCheck, { [WORKSPACES]: denied });
    expect(blocked.failed.map((f) => f.title)).toEqual([
      'Could not verify Log Analytics workspaces',
    ]);
  });
});

describe('sentinelDataConnectorsCheck', () => {
  const connector = (
    kind: string,
    dataTypes: Record<string, { state: string }>,
    name = `c-${kind}`,
  ) => ({
    id: `${WS_ID}/providers/Microsoft.SecurityInsights/dataConnectors/${name}`,
    name,
    kind,
    properties: { tenantId: 't', dataTypes },
  });

  it('passes enabled connectors and flags disabled ones and missing expected sources', async () => {
    const { passed, failed } = await run(sentinelDataConnectorsCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [CONNECTORS]: {
        value: [
          connector('Office365', {
            exchange: { state: 'Enabled' },
            sharePoint: { state: 'Enabled' },
            teams: { state: 'Disabled' },
          }),
          connector('AzureSecurityCenter', { alerts: { state: 'Disabled' } }),
        ],
      },
    });
    expect(passed.map((p) => p.title)).toEqual([
      'Data connector: Office 365 (Exchange, SharePoint, Teams) (law-sec)',
    ]);
    expect(passed[0].evidence.enabledDataTypes).toEqual(['exchange', 'sharePoint']);
    expect(failed.map((f) => [f.title, f.severity])).toEqual([
      ['Data connector with nothing enabled: Defender for Cloud alerts (law-sec)', 'low'],
      ['Defender alerts (Defender XDR or Defender for Endpoint) not connected: law-sec', 'medium'],
    ]);
  });

  it('fails hard with no connectors and reports a missing Sentinel onboarding', async () => {
    const empty = await run(sentinelDataConnectorsCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [CONNECTORS]: { value: [] },
    });
    expect(empty.failed.map((f) => [f.title, f.severity])).toEqual([
      ['No data connectors: law-sec', 'high'],
    ]);

    resetSentinelCache();
    const noSentinel = await run(sentinelDataConnectorsCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: notFound,
    });
    expect(noSentinel.failed.map((f) => f.title)).toEqual([
      'No Microsoft Sentinel workspace found',
    ]);
  });
});

describe('Sentinel analytics rules', () => {
  const rule = (
    kind: string,
    enabled: boolean,
    severity = 'High',
    displayName = `${kind} rule`,
  ) => ({
    id: `${WS_ID}/providers/Microsoft.SecurityInsights/alertRules/${displayName}`,
    name: displayName,
    kind,
    properties: { displayName, enabled, severity, tactics: ['Persistence'] },
  });

  it('summarises enabled rules and flags a disabled Fusion rule, reusing the workspace read', async () => {
    const routes: Routes = {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [RULES]: {
        value: [
          rule('Scheduled', true),
          rule('Scheduled', true, 'Medium', 'second'),
          rule('NRT', false),
          rule('Fusion', false),
        ],
      },
    };
    const a = await run(sentinelAnalyticsRulesCheck, routes);
    expect(a.passed.map((p) => p.title)).toEqual(['2 analytics rules enabled: law-sec']);
    expect(a.passed[0].evidence.enabledBySeverity).toEqual({ High: 1, Medium: 1 });
    expect(a.failed.map((f) => [f.title, f.severity])).toEqual([
      ['Fusion multi-stage attack detection disabled: law-sec', 'low'],
    ]);

    const b = await run(sentinelDetectionCapabilityCheck, routes);
    expect(b.calls.some((c) => c.startsWith(WORKSPACES))).toBe(false);
    expect(b.passed).toHaveLength(1);
  });

  it('fails when nothing is enabled', async () => {
    const { passed, failed } = await run(sentinelAnalyticsRulesCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [RULES]: { value: [rule('Scheduled', false)] },
    });
    expect(passed).toHaveLength(0);
    expect(failed.map((f) => [f.title, f.severity])).toEqual([
      ['No enabled analytics rules: law-sec', 'high'],
    ]);
  });
});

describe('sentinelOpenIncidentsCheck', () => {
  const incident = (n: number, severity: string, extra: Record<string, unknown> = {}) => ({
    id: `${WS_ID}/providers/Microsoft.SecurityInsights/incidents/i-${n}`,
    name: `i-${n}`,
    properties: {
      title: `Incident ${n}`,
      severity,
      status: 'New',
      incidentNumber: n,
      createdTimeUtc: ago(4),
      additionalData: { alertsCount: 2, alertProductNames: ['Microsoft Defender for Endpoint'] },
      ...extra,
    },
  });

  it('passes an empty queue and files each open incident with severity, age and owner', async () => {
    const clear = await run(sentinelOpenIncidentsCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [INCIDENTS]: { value: [] },
    });
    expect(clear.passed.map((p) => p.title)).toEqual(['No open incidents: law-sec']);
    expect(clear.calls.find((c) => c.startsWith(INCIDENTS))).toContain(
      '&$filter=properties%2Fstatus%20ne',
    );

    resetSentinelCache();
    const open = await run(sentinelOpenIncidentsCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [INCIDENTS]: {
        value: [
          incident(12, 'High', { owner: { userPrincipalName: 'soc@shop.com' }, status: 'Active' }),
          incident(13, 'Informational'),
        ],
      },
    });
    expect(open.passed).toHaveLength(0);
    expect(open.failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['law-sec/12', 'high'],
      ['law-sec/13', 'low'],
    ]);
    expect(open.failed[0].description).toContain('assigned to soc@shop.com');
    expect(open.failed[1].description).toContain('unassigned');
    expect(open.failed[0].evidence?.ageDays).toBe(4);
  });

  it('reports unreadable incidents as unverified without touching other workspaces', async () => {
    const { failed } = await run(sentinelOpenIncidentsCheck, {
      [WORKSPACES]: workspace(),
      [ONBOARDING]: onboarded,
      [INCIDENTS]: denied,
    });
    expect(failed.map((f) => f.title)).toEqual(['Could not verify Sentinel incidents in law-sec']);
    expect(failed[0].remediation).toContain('Microsoft Sentinel Reader');
  });
});

describe('entraLogExportCheck', () => {
  const setting = (categories: string[], extra: Record<string, unknown> = {}) => ({
    name: 'to-sentinel',
    properties: {
      workspaceId: WS_ID,
      logs: ['SignInLogs', 'AuditLogs', 'NonInteractiveUserSignInLogs'].map((c) => ({
        category: c,
        enabled: categories.includes(c),
      })),
      ...extra,
    },
  });

  it('passes when sign-in and audit logs reach a workspace and lists missing recommended categories as low', async () => {
    const { passed, failed } = await run(entraLogExportCheck, {
      [AADIAM]: { value: [setting(['SignInLogs', 'AuditLogs', 'NonInteractiveUserSignInLogs'])] },
    });
    expect(passed.map((p) => p.title)).toEqual(['Entra ID sign-in and audit logs are exported']);
    expect(passed[0].description).toContain('workspace:law-sec');
    expect(failed.map((f) => [f.severity, f.evidence?.missingRecommended])).toEqual([
      [
        'low',
        [
          'ServicePrincipalSignInLogs',
          'ManagedIdentitySignInLogs',
          'ProvisioningLogs',
          'RiskyUsers',
          'UserRiskEvents',
        ],
      ],
    ]);
  });

  it('fails when a required category is off, when there is no setting, and when the read is denied', async () => {
    const partial = await run(entraLogExportCheck, {
      [AADIAM]: { value: [setting(['SignInLogs'])] },
    });
    expect(partial.failed[0].title).toBe('Entra ID export missing AuditLogs');

    const none = await run(entraLogExportCheck, { [AADIAM]: { value: [] } });
    expect(none.failed.map((f) => f.title)).toEqual(['Entra ID logs are not exported']);

    const blocked = await run(entraLogExportCheck, { [AADIAM]: denied });
    expect(blocked.failed.map((f) => f.title)).toEqual([
      'Could not verify Entra ID diagnostic settings',
    ]);
    expect(blocked.failed[0].remediation).toContain('Global Reader');

    // a setting without a destination exports nothing
    expect(
      exportedCategories([
        { name: 'x', properties: { logs: [{ category: 'SignInLogs', enabled: true }] } },
      ]).size,
    ).toBe(0);
  });
});
