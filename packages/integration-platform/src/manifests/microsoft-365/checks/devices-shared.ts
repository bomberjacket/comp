import type { CheckContext } from '../../../types';
import { emitUnverified, graphListAll, graphListAllOrFail } from '../graph';
import type { GraphManagedDevice, GraphWindowsProtectionState } from '../types';

export const INTUNE_PERMISSION =
  'DeviceManagementManagedDevices.Read.All (the tenant also needs an Intune licence)';

const DEVICE_FIELDS = [
  'id',
  'deviceName',
  'operatingSystem',
  'osVersion',
  'manufacturer',
  'model',
  'serialNumber',
  'userPrincipalName',
  'complianceState',
  'isEncrypted',
  'lastSyncDateTime',
  'enrolledDateTime',
  'managementAgent',
  'managedDeviceOwnerType',
  'deviceEnrollmentType',
  'azureADDeviceId',
  'jailBroken',
].join(',');

const DEVICES_PATH = '/v1.0/deviceManagement/managedDevices';
const DEVICES_PARAMS = { $select: DEVICE_FIELDS, $top: '1000' };

/** Every Intune-managed device, or null after one "could not verify" finding. */
export async function listManagedDevices(ctx: CheckContext): Promise<GraphManagedDevice[] | null> {
  return graphListAllOrFail<GraphManagedDevice>(ctx, DEVICES_PATH, {
    what: 'the Intune device inventory',
    resourceType: 'tenant',
    permission: INTUNE_PERMISSION,
    params: DEVICES_PARAMS,
  });
}

export function deviceLabel(d: GraphManagedDevice): string {
  return d.deviceName || d.serialNumber || d.id;
}

export function isWindows(d: GraphManagedDevice): boolean {
  return (d.operatingSystem ?? '').toLowerCase().startsWith('windows');
}

export function deviceEvidence(d: GraphManagedDevice): Record<string, unknown> {
  return {
    id: d.id,
    deviceName: d.deviceName ?? null,
    operatingSystem: d.operatingSystem ?? null,
    osVersion: d.osVersion ?? null,
    manufacturer: d.manufacturer ?? null,
    model: d.model ?? null,
    serialNumber: d.serialNumber ?? null,
    userPrincipalName: d.userPrincipalName ?? null,
    complianceState: d.complianceState ?? null,
    isEncrypted: d.isEncrypted ?? null,
    lastSyncDateTime: d.lastSyncDateTime ?? null,
    enrolledDateTime: d.enrolledDateTime ?? null,
    managementAgent: d.managementAgent ?? null,
    ownerType: d.managedDeviceOwnerType ?? null,
    enrollmentType: d.deviceEnrollmentType ?? null,
    entraDeviceId: d.azureADDeviceId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Defender Antivirus state, read through Intune (beta endpoint, one call per
// Windows device). Four checks consume it, and the runner gives each check a
// fresh context, so the read is cached per connection for the length of a scan.
// ---------------------------------------------------------------------------

export interface ProtectionEntry {
  device: GraphManagedDevice;
  /** null when the device reported no Defender state (not Windows, no agent, 404). */
  state: GraphWindowsProtectionState | null;
  error?: string;
}

type ProtectionLoad =
  | { ok: true; entries: ProtectionEntry[]; windowsDevices: number }
  | { ok: false; what: string; error: unknown };

/** Upper bound on per-device reads in one scan; larger fleets are truncated with a warning. */
export const MAX_PROTECTION_DEVICES = 1000;
const PROTECTION_CACHE_TTL_MS = 10 * 60_000;
const protectionCache = new Map<string, { at: number; promise: Promise<ProtectionLoad> }>();

/** Test hook: forget cached reads between test cases. */
export function resetDeviceCaches(): void {
  protectionCache.clear();
}

async function readProtection(ctx: CheckContext): Promise<ProtectionLoad> {
  let devices: GraphManagedDevice[];
  try {
    devices = await graphListAll<GraphManagedDevice>(ctx, DEVICES_PATH, DEVICES_PARAMS);
  } catch (error) {
    return { ok: false, what: 'the Intune device inventory', error };
  }

  const windows = devices.filter(isWindows);
  const entries: ProtectionEntry[] = [];
  for (const device of windows.slice(0, MAX_PROTECTION_DEVICES)) {
    try {
      const state = await ctx.fetch<GraphWindowsProtectionState>(
        `/beta/deviceManagement/managedDevices/${device.id}/windowsProtectionState`,
      );
      entries.push({ device, state: state ?? null });
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        return { ok: false, what: 'Defender Antivirus state from Intune', error: err };
      }
      entries.push({ device, state: null, error: String(err).slice(0, 200) });
    }
  }
  return { ok: true, entries, windowsDevices: windows.length };
}

/**
 * Defender Antivirus state for every Windows device in Intune, or null after
 * one "could not verify" finding on this check's context.
 */
export async function loadWindowsProtection(ctx: CheckContext): Promise<ProtectionEntry[] | null> {
  const key = `${ctx.organizationId}:${ctx.connectionId}`;
  const hit = protectionCache.get(key);
  let promise: Promise<ProtectionLoad>;
  if (hit && Date.now() - hit.at < PROTECTION_CACHE_TTL_MS) {
    ctx.log('Reusing the Defender state read earlier in this scan');
    promise = hit.promise;
  } else {
    promise = readProtection(ctx);
    protectionCache.set(key, { at: Date.now(), promise });
  }

  const load = await promise;
  if (!load.ok) {
    protectionCache.delete(key);
    emitUnverified(
      ctx,
      { what: load.what, resourceType: 'tenant', permission: INTUNE_PERMISSION },
      load.error,
    );
    return null;
  }
  if (load.windowsDevices > load.entries.length) {
    ctx.warn(
      `Only the first ${load.entries.length} of ${load.windowsDevices} Windows devices were read`,
    );
  }
  ctx.log(`Defender state: ${load.entries.length} Windows devices`);
  return load.entries;
}

export function protectionEvidence(e: ProtectionEntry): Record<string, unknown> {
  const s = e.state;
  return {
    ...deviceEvidence(e.device),
    defender: s
      ? {
          malwareProtectionEnabled: s.malwareProtectionEnabled ?? null,
          realTimeProtectionEnabled: s.realTimeProtectionEnabled ?? null,
          tamperProtectionEnabled: s.tamperProtectionEnabled ?? null,
          networkInspectionSystemEnabled: s.networkInspectionSystemEnabled ?? null,
          signatureUpdateOverdue: s.signatureUpdateOverdue ?? null,
          signatureVersion: s.signatureVersion ?? null,
          engineVersion: s.engineVersion ?? null,
          antiMalwareVersion: s.antiMalwareVersion ?? null,
          quickScanOverdue: s.quickScanOverdue ?? null,
          fullScanOverdue: s.fullScanOverdue ?? null,
          lastQuickScanDateTime: s.lastQuickScanDateTime ?? null,
          lastFullScanDateTime: s.lastFullScanDateTime ?? null,
          lastReportedDateTime: s.lastReportedDateTime ?? null,
          productStatus: s.productStatus ?? null,
          deviceState: s.deviceState ?? null,
          rebootRequired: s.rebootRequired ?? null,
        }
      : null,
    readError: e.error ?? null,
  };
}

/** Emit the shared "no Defender data" finding for a device without state. */
export function failNoDefenderState(ctx: CheckContext, e: ProtectionEntry): void {
  const name = deviceLabel(e.device);
  ctx.fail({
    title: `No Defender status reported: ${name}`,
    description: `Intune has no Defender Antivirus state for ${name}${e.error ? ` (${e.error})` : ''}, so its protection cannot be confirmed.`,
    resourceType: 'device',
    resourceId: name,
    severity: 'low',
    remediation:
      'Confirm Microsoft Defender Antivirus is running on the device and that it syncs with Intune; third-party antivirus is not reported here.',
    evidence: protectionEvidence(e),
  });
}
