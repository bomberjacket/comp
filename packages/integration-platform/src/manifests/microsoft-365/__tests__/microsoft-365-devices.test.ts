import { beforeEach, describe, expect, it } from 'bun:test';
import {
  defenderOpenAlertsCheck,
  defenderRealTimeProtectionCheck,
  defenderRealTimeScansCheck,
  defenderScansCheck,
  defenderSignaturesCheck,
  intuneCompliancePoliciesCheck,
  intuneDeviceComplianceCheck,
  intuneDeviceEncryptionCheck,
  intuneDeviceInventoryCheck,
  intuneMobileEncryptionCheck,
  intuneStaleDevicesCheck,
} from '../checks';
import { resetDeviceCaches } from '../checks/devices-shared';
import { policyRequiresCompliantDevice } from '../checks/intune-compliance';
import { microsoft365Manifest } from '../index';
import type {
  GraphCompliancePolicy,
  GraphManagedDevice,
  GraphSecurityAlert,
  GraphWindowsProtectionState,
} from '../types';
import { DAY, denied, makeCtx, notFound, type Routes } from './test-context';

const DEVICES = '/v1.0/deviceManagement/managedDevices';
const POLICIES = '/v1.0/deviceManagement/deviceCompliancePolicies';
const CA = '/v1.0/identity/conditionalAccess/policies';
const ALERTS = '/v1.0/security/alerts_v2';
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const device = (
  overrides: Partial<GraphManagedDevice> & { deviceName: string },
): GraphManagedDevice => ({
  id: `dev-${overrides.deviceName}`,
  operatingSystem: 'Windows',
  osVersion: '10.0.26300.9711',
  manufacturer: 'Dell',
  model: 'Vostro',
  complianceState: 'compliant',
  isEncrypted: true,
  lastSyncDateTime: ago(1),
  enrolledDateTime: ago(300),
  managementAgent: 'mdm',
  userPrincipalName: 'alice@shop.com',
  ...overrides,
});

const protection = (
  overrides: Partial<GraphWindowsProtectionState> = {},
): GraphWindowsProtectionState => ({
  malwareProtectionEnabled: true,
  realTimeProtectionEnabled: true,
  tamperProtectionEnabled: true,
  signatureUpdateOverdue: false,
  signatureVersion: '1.433.100.0',
  engineVersion: '1.1.25090.1',
  lastQuickScanDateTime: ago(2),
  lastFullScanDateTime: ago(20),
  lastReportedDateTime: ago(0),
  ...overrides,
});

const stateRoute = (name: string) =>
  `/beta/deviceManagement/managedDevices/dev-${name}/windowsProtectionState`;

const policy = (
  overrides: Partial<GraphCompliancePolicy> & { displayName: string },
): GraphCompliancePolicy => ({
  id: `pol-${overrides.displayName}`,
  '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
  assignments: [
    { id: 'a1', target: { '@odata.type': '#microsoft.graph.allDevicesAssignmentTarget' } },
  ],
  ...overrides,
});

beforeEach(() => resetDeviceCaches());

describe('manifest (devices)', () => {
  it('asks for the Intune and Defender permissions and marks both services implemented', () => {
    if (microsoft365Manifest.auth.type !== 'oauth2') throw new Error('expected oauth2');
    for (const p of [
      'DeviceManagementManagedDevices.Read.All',
      'DeviceManagementConfiguration.Read.All',
      'SecurityAlert.Read.All',
    ]) {
      expect(microsoft365Manifest.auth.config.scopes).toContain(`https://graph.microsoft.com/${p}`);
    }
    const services = Object.fromEntries(
      (microsoft365Manifest.services ?? []).map((s) => [s.id, s.implemented]),
    );
    expect(services.intune).toBe(true);
    expect(services['defender-endpoint']).toBe(true);
    expect(microsoft365Manifest.variables?.map((v) => v.id)).toContain('scan_max_days');
  });
});

describe('Intune inventory', () => {
  it('passes every managed device as inventory and fails an empty tenant', async () => {
    const { ctx, passed, failed } = makeCtx({
      [DEVICES]: [
        device({ deviceName: 'LT-01' }),
        device({ deviceName: 'PH-02', operatingSystem: 'iOS' }),
      ],
    });
    await intuneDeviceInventoryCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['LT-01', 'PH-02']);
    expect(passed[0].evidence.osVersion).toBe('10.0.26300.9711');
    expect(failed).toHaveLength(0);

    const empty = makeCtx({ [DEVICES]: [] });
    await intuneDeviceInventoryCheck.run(empty.ctx);
    expect(empty.failed.map((f) => f.title)).toEqual(['No managed devices in Intune']);
  });

  it('reports the Intune permission when the inventory cannot be read', async () => {
    const { ctx, failed } = makeCtx({ [DEVICES]: denied });
    await intuneDeviceInventoryCheck.run(ctx);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toBe('Could not verify the Intune device inventory');
    expect(failed[0].remediation).toContain('DeviceManagementManagedDevices.Read.All');
  });

  it('flags devices past the check-in period, honouring the variable', async () => {
    const routes: Routes = {
      [DEVICES]: [
        device({ deviceName: 'fresh', lastSyncDateTime: ago(3) }),
        device({ deviceName: 'stale', lastSyncDateTime: ago(45) }),
        device({ deviceName: 'ghost', lastSyncDateTime: ago(200) }),
        device({ deviceName: 'never', lastSyncDateTime: null }),
      ],
    };
    const a = makeCtx(routes);
    await intuneStaleDevicesCheck.run(a.ctx);
    expect(a.passed.map((p) => p.resourceId)).toEqual(['fresh']);
    expect(a.failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['stale', 'low'],
      ['ghost', 'medium'],
      ['never', 'low'],
    ]);

    const b = makeCtx(routes, { device_stale_days: 60 });
    await intuneStaleDevicesCheck.run(b.ctx);
    expect(b.passed.map((p) => p.resourceId)).toEqual(['fresh', 'stale']);
  });
});

describe('Intune compliance', () => {
  it('passes assigned policies, flags unassigned ones and the secure-by-default setting', async () => {
    const { ctx, passed, failed, calls } = makeCtx({
      [POLICIES]: [
        policy({ displayName: 'Windows baseline' }),
        policy({
          displayName: 'iOS draft',
          '@odata.type': '#microsoft.graph.iosCompliancePolicy',
          assignments: [],
        }),
      ],
      '/v1.0/deviceManagement': { settings: { secureByDefault: false } },
    });
    await intuneCompliancePoliciesCheck.run(ctx);
    expect(passed.map((p) => p.title)).toEqual(['Compliance policy: Windows baseline (Windows)']);
    expect(failed.map((f) => [f.title, f.severity])).toEqual([
      ['Unassigned compliance policy: iOS draft', 'low'],
      ['Devices without a compliance policy count as compliant', 'medium'],
    ]);
    expect(calls).toContain('/v1.0/deviceManagement');
  });

  it('fails hard when no compliance policy exists', async () => {
    const { ctx, failed } = makeCtx({
      [POLICIES]: [],
      '/v1.0/deviceManagement': { settings: { secureByDefault: true } },
    });
    await intuneCompliancePoliciesCheck.run(ctx);
    expect(failed.map((f) => [f.title, f.severity])).toEqual([
      ['No device compliance policies', 'high'],
    ]);
  });

  it('reports each device state and whether Conditional Access requires compliance', async () => {
    const { ctx, passed, failed } = makeCtx({
      [DEVICES]: [
        device({ deviceName: 'ok' }),
        device({ deviceName: 'bad', complianceState: 'noncompliant' }),
        device({ deviceName: 'grace', complianceState: 'inGracePeriod' }),
        device({ deviceName: 'mystery', complianceState: 'unknown' }),
      ],
      [CA]: [
        {
          id: 'ca1',
          displayName: 'Require compliant device',
          state: 'enabled',
          conditions: {
            users: { includeUsers: ['All'] },
            applications: { includeApplications: ['All'] },
          },
          grantControls: { operator: 'AND', builtInControls: ['compliantDevice', 'mfa'] },
        },
        {
          id: 'ca2',
          displayName: 'Report only',
          state: 'enabledForReportingButNotEnforced',
          grantControls: { builtInControls: ['compliantDevice'] },
        },
      ],
    });
    await intuneDeviceComplianceCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['ok', 'compliant-device']);
    expect(passed[1].evidence.policies).toHaveLength(1);
    expect(failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['bad', 'medium'],
      ['grace', 'low'],
      ['mystery', 'low'],
    ]);
  });

  it('fails the enforcement half when no policy requires a compliant device', async () => {
    const { ctx, failed } = makeCtx({ [DEVICES]: [device({ deviceName: 'ok' })], [CA]: [] });
    await intuneDeviceComplianceCheck.run(ctx);
    expect(failed.map((f) => f.title)).toEqual([
      'No Conditional Access policy requires a compliant device',
    ]);
    expect(
      policyRequiresCompliantDevice({
        id: 'x',
        displayName: 'x',
        state: 'enabled',
        grantControls: { builtInControls: ['mfa'] },
      }),
    ).toBe(false);
  });
});

describe('Intune encryption', () => {
  it('passes encrypted devices, fails unencrypted and unreported ones, for both objectives', async () => {
    const routes: Routes = {
      [DEVICES]: [
        device({ deviceName: 'enc' }),
        device({ deviceName: 'plain', isEncrypted: false }),
        device({ deviceName: 'blank', isEncrypted: null }),
      ],
    };
    const a = makeCtx(routes);
    await intuneDeviceEncryptionCheck.run(a.ctx);
    expect(a.passed.map((p) => p.resourceId)).toEqual(['enc']);
    expect(a.failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['plain', 'high'],
      ['blank', 'low'],
    ]);

    const b = makeCtx(routes);
    await intuneMobileEncryptionCheck.run(b.ctx);
    expect(b.failed.map((f) => f.resourceId)).toEqual(['plain', 'blank']);
  });
});

describe('Defender Antivirus state', () => {
  const fleet: Routes = {
    [DEVICES]: [
      device({ deviceName: 'good' }),
      device({ deviceName: 'off' }),
      device({ deviceName: 'silent' }),
      device({ deviceName: 'mac', operatingSystem: 'macOS' }),
    ],
    [stateRoute('good')]: protection(),
    [stateRoute('off')]: protection({
      realTimeProtectionEnabled: false,
      signatureUpdateOverdue: true,
      lastQuickScanDateTime: ago(30),
      lastFullScanDateTime: null,
    }),
    [stateRoute('silent')]: notFound,
  };

  it('reads real-time protection per Windows device and skips other platforms', async () => {
    const { ctx, passed, failed, calls } = makeCtx(fleet);
    await defenderRealTimeProtectionCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['good']);
    expect(passed[0].evidence.defender).toMatchObject({ tamperProtectionEnabled: true });
    expect(failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['off', 'high'],
      ['silent', 'low'],
    ]);
    expect(calls.some((c) => c.includes('dev-mac'))).toBe(false);
  });

  it('reads the fleet once for all Defender checks on the same connection', async () => {
    const a = makeCtx(fleet);
    await defenderRealTimeScansCheck.run(a.ctx);
    const b = makeCtx(fleet);
    await defenderSignaturesCheck.run(b.ctx);
    expect(b.calls).toHaveLength(0);
    expect(a.passed.map((p) => p.resourceId)).toEqual(['good']);
    expect(b.failed.map((f) => [f.resourceId, f.title])).toEqual([
      ['off', 'Signatures out of date: off'],
      ['silent', 'No Defender status reported: silent'],
    ]);
    expect(b.passed.map((p) => p.resourceId)).toEqual(['good']);
  });

  it('compares the last scan with the defined frequency', async () => {
    const a = makeCtx(fleet);
    await defenderScansCheck.run(a.ctx);
    expect(a.passed.map((p) => p.resourceId)).toEqual(['good']);
    expect(a.failed.map((f) => f.resourceId)).toEqual(['off', 'silent']);
    expect(a.failed[0].description).toContain('30 days ago');

    resetDeviceCaches();
    const b = makeCtx(fleet, { scan_max_days: 45 });
    await defenderScansCheck.run(b.ctx);
    expect(b.passed.map((p) => p.resourceId)).toEqual(['good', 'off']);
  });

  it('turns a permission failure on the protection state into one unverified finding', async () => {
    const { ctx, passed, failed } = makeCtx({
      [DEVICES]: [device({ deviceName: 'good' })],
      [stateRoute('good')]: denied,
    });
    await defenderRealTimeProtectionCheck.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed.map((f) => f.title)).toEqual([
      'Could not verify Defender Antivirus state from Intune',
    ]);
  });

  it('fails when the tenant has no Windows devices to read', async () => {
    const { ctx, failed } = makeCtx({
      [DEVICES]: [device({ deviceName: 'mac', operatingSystem: 'macOS' })],
    });
    await defenderSignaturesCheck.run(ctx);
    expect(failed.map((f) => f.title)).toEqual(['No Windows devices in Intune']);
  });
});

describe('Defender alerts', () => {
  const alert = (overrides: Partial<GraphSecurityAlert> & { id: string }): GraphSecurityAlert => ({
    title: 'Suspicious PowerShell',
    category: 'Execution',
    severity: 'high',
    status: 'new',
    serviceSource: 'microsoftDefenderForEndpoint',
    createdDateTime: ago(3),
    evidence: [
      {
        '@odata.type': '#microsoft.graph.security.deviceEvidence',
        deviceDnsName: 'LT-01.shop.local',
      },
      {
        '@odata.type': '#microsoft.graph.security.userEvidence',
        userAccount: { userPrincipalName: 'alice@shop.com' },
      },
    ],
    ...overrides,
  });

  it('passes an empty queue', async () => {
    const { ctx, passed, failed, calls } = makeCtx({ [ALERTS]: [] });
    await defenderOpenAlertsCheck.run(ctx);
    expect(passed.map((p) => p.title)).toEqual(['No open Defender alerts']);
    expect(failed).toHaveLength(0);
    expect(calls[0]).toBe(ALERTS);
  });

  it('files every open alert with its severity, source and assets', async () => {
    const { ctx, passed, failed } = makeCtx({
      [ALERTS]: [
        alert({ id: 'a1' }),
        alert({
          id: 'a2',
          severity: 'informational',
          status: 'inProgress',
          assignedTo: 'soc@shop.com',
          serviceSource: 'microsoftDefenderForOffice365',
          evidence: [],
        }),
      ],
    });
    await defenderOpenAlertsCheck.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['a1', 'high'],
      ['a2', 'low'],
    ]);
    expect(failed[0].description).toContain('Defender for Endpoint');
    expect(failed[0].description).toContain('LT-01.shop.local');
    expect(failed[0].evidence?.users).toEqual(['alice@shop.com']);
    expect(failed[1].description).toContain('assigned to soc@shop.com');
  });

  it('reports the licence/permission problem when alerts cannot be read', async () => {
    const { ctx, failed } = makeCtx({ [ALERTS]: denied });
    await defenderOpenAlertsCheck.run(ctx);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toBe('Could not verify Defender alerts');
    expect(failed[0].remediation).toContain('SecurityAlert.Read.All');
  });
});
