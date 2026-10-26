import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import { daysSince } from '../graph';
import { deviceStaleDaysVariable, parseDeviceOptions } from '../variables';
import { deviceEvidence, deviceLabel, listManagedDevices } from './devices-shared';

function describeDevice(d: {
  operatingSystem?: string | null;
  osVersion?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  userPrincipalName?: string | null;
}): string {
  const os = [d.operatingSystem, d.osVersion].filter(Boolean).join(' ') || 'unknown OS';
  const hw = [d.manufacturer, d.model].filter(Boolean).join(' ') || 'unknown hardware';
  const user = d.userPrincipalName ? `, user ${d.userPrincipalName}` : ', no primary user';
  return `${os}, ${hw}${user}`;
}

/** 3.4.1[d] A system inventory is established. */
export const intuneDeviceInventoryCheck: IntegrationCheck = {
  id: 'intune-device-inventory',
  name: 'System inventory from Intune (3.4.1)',
  description:
    'Records every Intune-managed device (name, OS and version, make and model, serial, primary user, management agent, last sync) as the system inventory for 3.4.1[d]. Devices not enrolled in Intune are not seen.',
  service: 'intune',
  taskMapping: TASK_TEMPLATES['3.4.1[d]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const devices = await listManagedDevices(ctx);
    if (!devices) return;
    ctx.log(`Intune inventory: ${devices.length} managed devices`);

    if (devices.length === 0) {
      ctx.fail({
        title: 'No managed devices in Intune',
        description:
          'Intune returned no managed devices, so it cannot serve as the system inventory for this tenant.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        severity: 'medium',
        remediation:
          'Enroll endpoints in Intune, or keep the inventory in another tool and attach it to this task.',
      });
      return;
    }

    for (const d of devices) {
      ctx.pass({
        title: `Managed device: ${deviceLabel(d)}`,
        description: `${describeDevice(d)}; enrolled ${d.enrolledDateTime?.slice(0, 10) ?? 'unknown'} via ${d.managementAgent ?? 'unknown agent'}.`,
        resourceType: 'device',
        resourceId: deviceLabel(d),
        evidence: deviceEvidence(d),
      });
    }
  },
};

/** 3.4.1[f] The inventory is maintained (reviewed and updated). */
export const intuneStaleDevicesCheck: IntegrationCheck = {
  id: 'intune-stale-devices',
  name: 'Inventory kept current (3.4.1)',
  description:
    'Flags Intune-managed devices that have not synced within the check-in period, so retired or lost devices do not linger in the inventory. Evidence for 3.4.1[f].',
  service: 'intune',
  taskMapping: TASK_TEMPLATES['3.4.1[f]'],
  defaultSeverity: 'low',
  variables: [deviceStaleDaysVariable],

  run: async (ctx) => {
    const { staleDays } = parseDeviceOptions(ctx.variables);
    const devices = await listManagedDevices(ctx);
    if (!devices) return;
    const now = Date.now();
    ctx.log(`Stale device check: ${devices.length} devices, threshold ${staleDays} days`);

    for (const d of devices) {
      const name = deviceLabel(d);
      const idleDays = daysSince(d.lastSyncDateTime, now);
      const evidence = { ...deviceEvidence(d), daysSinceSync: idleDays, thresholdDays: staleDays };

      if (idleDays === null || idleDays > staleDays) {
        ctx.fail({
          title: `Stale device: ${name}`,
          description:
            idleDays === null
              ? `${name} has never synced with Intune.`
              : `${name} last synced ${idleDays} days ago, past the ${staleDays}-day check-in period.`,
          resourceType: 'device',
          resourceId: name,
          severity: idleDays !== null && idleDays > staleDays * 3 ? 'medium' : 'low',
          remediation:
            'Confirm the device is still in use and brings it online to sync; retire or delete it from Intune if it is gone, and update the inventory.',
          evidence,
        });
      } else {
        ctx.pass({
          title: `Synced within ${staleDays} days: ${name}`,
          description: `${name} last synced with Intune ${idleDays} days ago.`,
          resourceType: 'device',
          resourceId: name,
          evidence,
        });
      }
    }
  },
};
