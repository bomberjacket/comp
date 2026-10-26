import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { graphListAll, graphListAllOrFail } from '../graph';
import type {
  GraphCompliancePolicy,
  GraphConditionalAccessPolicy,
  GraphDeviceManagement,
} from '../types';
import { deviceEvidence, deviceLabel, listManagedDevices } from './devices-shared';

const POLICY_PLATFORM: Record<string, string> = {
  '#microsoft.graph.windows10CompliancePolicy': 'Windows',
  '#microsoft.graph.windows81CompliancePolicy': 'Windows 8.1',
  '#microsoft.graph.macOSCompliancePolicy': 'macOS',
  '#microsoft.graph.iosCompliancePolicy': 'iOS/iPadOS',
  '#microsoft.graph.androidCompliancePolicy': 'Android device administrator',
  '#microsoft.graph.androidWorkProfileCompliancePolicy': 'Android work profile',
  '#microsoft.graph.androidDeviceOwnerCompliancePolicy': 'Android Enterprise',
  '#microsoft.graph.aospDeviceOwnerCompliancePolicy': 'Android AOSP',
};

export function policyPlatform(p: GraphCompliancePolicy): string {
  const type = p['@odata.type'] ?? '';
  return POLICY_PLATFORM[type] ?? (type.replace('#microsoft.graph.', '') || 'unknown platform');
}

/** True when an enabled Conditional Access policy grants access only to compliant devices. */
export function policyRequiresCompliantDevice(p: GraphConditionalAccessPolicy): boolean {
  return p.state === 'enabled' && !!p.grantControls?.builtInControls?.includes('compliantDevice');
}

/** 3.4.2[a] Security configuration settings are established. */
export const intuneCompliancePoliciesCheck: IntegrationCheck = {
  id: 'intune-compliance-policies',
  name: 'Compliance policies defined and assigned (3.4.2)',
  description:
    'Lists Intune device compliance policies (encryption, minimum OS, password, Defender, jailbreak rules) and whether each is assigned, plus whether devices with no policy count as noncompliant. Evidence for 3.4.2[a].',
  service: 'intune',
  taskMapping: TASK_TEMPLATES['3.4.2[a]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const policies = await graphListAllOrFail<GraphCompliancePolicy>(
      ctx,
      '/v1.0/deviceManagement/deviceCompliancePolicies',
      {
        what: 'Intune compliance policies',
        resourceType: 'tenant',
        permission: 'DeviceManagementConfiguration.Read.All',
        params: { $expand: 'assignments' },
      },
    );
    if (!policies) return;
    ctx.log(`Compliance policies: ${policies.length}`);

    if (policies.length === 0) {
      ctx.fail({
        title: 'No device compliance policies',
        description:
          'Intune has no compliance policies, so no security configuration settings are defined for managed devices.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        severity: 'high',
        remediation:
          'Create a compliance policy per platform (encryption, minimum OS version, password, Defender required) and assign it to all devices.',
      });
      return;
    }

    for (const p of policies) {
      const targets = (p.assignments ?? []).map((a) => ({
        type: (a.target?.['@odata.type'] ?? '').replace('#microsoft.graph.', '') || null,
        groupId: a.target?.groupId ?? null,
      }));
      const evidence = {
        id: p.id,
        displayName: p.displayName,
        platform: policyPlatform(p),
        description: p.description ?? null,
        lastModifiedDateTime: p.lastModifiedDateTime ?? null,
        version: p.version ?? null,
        assignments: targets,
      };
      if (targets.length > 0) {
        ctx.pass({
          title: `Compliance policy: ${p.displayName} (${policyPlatform(p)})`,
          description: `${p.displayName} is assigned to ${targets.length} target${targets.length === 1 ? '' : 's'}.`,
          resourceType: 'compliance-policy',
          resourceId: p.displayName,
          evidence,
        });
      } else {
        ctx.fail({
          title: `Unassigned compliance policy: ${p.displayName}`,
          description: `${p.displayName} (${policyPlatform(p)}) exists but is not assigned, so it governs no device.`,
          resourceType: 'compliance-policy',
          resourceId: p.displayName,
          severity: 'low',
          remediation: 'Assign the policy to the device groups it should cover, or delete it.',
          evidence,
        });
      }
    }

    await reportSecureByDefault(ctx);
  },
};

async function reportSecureByDefault(ctx: CheckContext): Promise<void> {
  let dm: GraphDeviceManagement;
  try {
    dm = await ctx.fetch<GraphDeviceManagement>('/v1.0/deviceManagement', {
      params: { $select: 'settings' },
    });
  } catch (err) {
    ctx.warn('Could not read Intune compliance policy settings', { error: String(err) });
    return;
  }
  const secureByDefault = dm?.settings?.secureByDefault;
  const evidence = { secureByDefault: secureByDefault ?? null };
  if (secureByDefault === true) {
    ctx.pass({
      title: 'Devices without a compliance policy count as noncompliant',
      description: 'Intune marks devices with no assigned compliance policy as not compliant.',
      resourceType: 'tenant',
      resourceId: 'tenant',
      evidence,
    });
  } else {
    ctx.fail({
      title: 'Devices without a compliance policy count as compliant',
      description:
        'Intune treats a device with no compliance policy as compliant, so an unassigned device passes every compliance gate.',
      resourceType: 'tenant',
      resourceId: 'tenant',
      severity: 'medium',
      remediation:
        'In Intune, Devices, Compliance, Compliance policy settings, set "Mark devices with no compliance policy assigned as" to Not compliant.',
      evidence,
    });
  }
}

/** 3.4.2[b] Security configuration settings are enforced. */
export const intuneDeviceComplianceCheck: IntegrationCheck = {
  id: 'intune-device-compliance',
  name: 'Device compliance enforced (3.4.2)',
  description:
    'Reports each managed device’s Intune compliance state and whether a Conditional Access policy requires a compliant device for access. Evidence for 3.4.2[b].',
  service: 'intune',
  taskMapping: TASK_TEMPLATES['3.4.2[b]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const devices = await listManagedDevices(ctx);
    if (!devices) return;
    ctx.log(`Device compliance: ${devices.length} devices`);

    for (const d of devices) {
      const name = deviceLabel(d);
      const state = d.complianceState ?? 'unknown';
      const evidence = deviceEvidence(d);
      if (state === 'compliant') {
        ctx.pass({
          title: `Compliant: ${name}`,
          description: `${name} meets its assigned Intune compliance policies.`,
          resourceType: 'device',
          resourceId: name,
          evidence,
        });
      } else if (state === 'noncompliant') {
        ctx.fail({
          title: `Noncompliant: ${name}`,
          description: `${name} fails at least one assigned compliance policy.`,
          resourceType: 'device',
          resourceId: name,
          severity: 'medium',
          remediation:
            'Open the device in Intune to see the failing setting, fix it on the device, and confirm the state returns to compliant.',
          evidence,
        });
      } else {
        ctx.fail({
          title: `Compliance ${state}: ${name}`,
          description:
            state === 'inGracePeriod'
              ? `${name} is noncompliant but inside its grace period.`
              : `${name} has compliance state "${state}", so enforcement cannot be confirmed.`,
          resourceType: 'device',
          resourceId: name,
          severity: 'low',
          remediation:
            'Have the device sync with Intune; if the state stays unknown or in conflict, review the assigned policies for that platform.',
          evidence,
        });
      }
    }

    await reportConditionalAccess(ctx);
  },
};

async function reportConditionalAccess(ctx: CheckContext): Promise<void> {
  let policies: GraphConditionalAccessPolicy[];
  try {
    policies = await graphListAll<GraphConditionalAccessPolicy>(
      ctx,
      '/v1.0/identity/conditionalAccess/policies',
    );
  } catch (err) {
    ctx.warn('Could not read Conditional Access policies', { error: String(err) });
    return;
  }
  const enforcing = policies.filter(policyRequiresCompliantDevice);
  if (enforcing.length > 0) {
    ctx.pass({
      title: 'Conditional Access requires a compliant device',
      description: `${enforcing.length} enabled polic${enforcing.length === 1 ? 'y requires' : 'ies require'} a compliant device: ${enforcing.map((p) => p.displayName).join(', ')}.`,
      resourceType: 'conditional-access',
      resourceId: 'compliant-device',
      evidence: {
        policies: enforcing.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          includeUsers: p.conditions?.users?.includeUsers ?? [],
          excludeUsers: p.conditions?.users?.excludeUsers ?? [],
          includeApplications: p.conditions?.applications?.includeApplications ?? [],
        })),
      },
    });
  } else {
    ctx.fail({
      title: 'No Conditional Access policy requires a compliant device',
      description:
        'Compliance state is recorded but nothing blocks a noncompliant device from reaching CUI; no enabled Conditional Access policy grants access only to compliant devices.',
      resourceType: 'conditional-access',
      resourceId: 'compliant-device',
      severity: 'medium',
      remediation:
        'Create a Conditional Access policy for all users and the apps that hold CUI with the grant control "Require device to be marked as compliant".',
      evidence: { policiesChecked: policies.length },
    });
  }
}
