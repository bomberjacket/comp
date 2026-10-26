import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { daysSince } from '../graph';
import { parseDeviceOptions, scanMaxDaysVariable } from '../variables';
import {
  deviceLabel,
  failNoDefenderState,
  loadWindowsProtection,
  protectionEvidence,
  type ProtectionEntry,
} from './devices-shared';

function failNoWindowsDevices(ctx: CheckContext): void {
  ctx.fail({
    title: 'No Windows devices in Intune',
    description:
      'Defender Antivirus status is read through Intune and no Windows devices are enrolled, so malicious code protection cannot be confirmed from here.',
    resourceType: 'tenant',
    resourceId: 'tenant',
    severity: 'medium',
    remediation:
      'Enroll Windows endpoints in Intune, or attach antivirus console evidence to this task by hand.',
  });
}

/** Shared by the 3.14.2[b] and 3.14.5[c] checks: real-time protection on every Windows device. */
async function runRealTimeProtection(ctx: CheckContext): Promise<void> {
  const entries = await loadWindowsProtection(ctx);
  if (!entries) return;
  if (entries.length === 0) return failNoWindowsDevices(ctx);

  for (const e of entries) {
    if (!e.state) {
      failNoDefenderState(ctx, e);
      continue;
    }
    const name = deviceLabel(e.device);
    const on =
      e.state.realTimeProtectionEnabled === true && e.state.malwareProtectionEnabled !== false;
    if (on) {
      ctx.pass({
        title: `Real-time protection on: ${name}`,
        description: `Defender Antivirus real-time protection is enabled on ${name}${e.state.tamperProtectionEnabled ? ' with tamper protection' : ''}.`,
        resourceType: 'device',
        resourceId: name,
        evidence: protectionEvidence(e),
      });
    } else {
      ctx.fail({
        title: `Real-time protection off: ${name}`,
        description: `Defender Antivirus reports ${e.state.malwareProtectionEnabled === false ? 'malware protection disabled' : 'real-time protection disabled'} on ${name}.`,
        resourceType: 'device',
        resourceId: name,
        severity: 'high',
        remediation:
          'Turn real-time protection back on (Intune antivirus policy or Defender settings) and enable tamper protection so users cannot switch it off.',
        evidence: protectionEvidence(e),
      });
    }
  }
}

/** 3.14.2[b] Protection from malicious code at designated locations is provided. */
export const defenderRealTimeProtectionCheck: IntegrationCheck = {
  id: 'defender-realtime-protection',
  name: 'Malicious code protection on endpoints (3.14.2)',
  description:
    'Reads Defender Antivirus state through Intune for every Windows device: malware protection and real-time protection enabled, tamper protection noted. Evidence for 3.14.2[b]. Third-party antivirus is not reported.',
  service: 'defender-endpoint',
  taskMapping: TASK_TEMPLATES['3.14.2[b]'],
  defaultSeverity: 'high',
  run: runRealTimeProtection,
};

/** 3.14.5[c] Real-time malicious code scans of files from external sources are performed. */
export const defenderRealTimeScansCheck: IntegrationCheck = {
  id: 'defender-realtime-scans',
  name: 'Real-time scans of downloaded and opened files (3.14.5)',
  description:
    'Same Defender real-time protection evidence, filed against 3.14.5[c]: real-time protection scans files as they are downloaded, opened or executed.',
  service: 'defender-endpoint',
  taskMapping: TASK_TEMPLATES['3.14.5[c]'],
  defaultSeverity: 'high',
  run: runRealTimeProtection,
};

/** 3.14.4[a] Malicious code protection mechanisms are updated when new releases are available. */
export const defenderSignaturesCheck: IntegrationCheck = {
  id: 'defender-signatures-current',
  name: 'Defender signatures current (3.14.4)',
  description:
    'Reports whether Defender Antivirus on each Windows device has current security intelligence (signature) updates, with the signature, engine and platform versions. Evidence for 3.14.4[a].',
  service: 'defender-endpoint',
  taskMapping: TASK_TEMPLATES['3.14.4[a]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const entries = await loadWindowsProtection(ctx);
    if (!entries) return;
    if (entries.length === 0) return failNoWindowsDevices(ctx);

    for (const e of entries) {
      if (!e.state) {
        failNoDefenderState(ctx, e);
        continue;
      }
      const name = deviceLabel(e.device);
      if (e.state.signatureUpdateOverdue === true) {
        ctx.fail({
          title: `Signatures out of date: ${name}`,
          description: `Defender on ${name} reports its security intelligence update is overdue (signature ${e.state.signatureVersion ?? 'unknown'}).`,
          resourceType: 'device',
          resourceId: name,
          severity: 'medium',
          remediation:
            'Confirm the device can reach Windows Update or the configured update source, then force a security intelligence update from Intune.',
          evidence: protectionEvidence(e),
        });
      } else {
        ctx.pass({
          title: `Signatures current: ${name}`,
          description: `Defender on ${name} runs signature ${e.state.signatureVersion ?? 'unknown'}, engine ${e.state.engineVersion ?? 'unknown'}; no update overdue.`,
          resourceType: 'device',
          resourceId: name,
          evidence: protectionEvidence(e),
        });
      }
    }
  },
};

function lastScan(e: ProtectionEntry): string | null {
  const dates = [e.state?.lastQuickScanDateTime, e.state?.lastFullScanDateTime].filter(
    (d): d is string => !!d,
  );
  return dates.length ? dates.sort().at(-1)! : null;
}

/** 3.14.5[b] Malicious code scans are performed with the defined frequency. */
export const defenderScansCheck: IntegrationCheck = {
  id: 'defender-periodic-scans',
  name: 'Periodic malware scans performed (3.14.5)',
  description:
    'Compares each Windows device’s last Defender quick or full scan with the scan frequency defined for 3.14.5[a]. Evidence for 3.14.5[b].',
  service: 'defender-endpoint',
  taskMapping: TASK_TEMPLATES['3.14.5[b]'],
  defaultSeverity: 'medium',
  variables: [scanMaxDaysVariable],

  run: async (ctx) => {
    const { scanMaxDays } = parseDeviceOptions(ctx.variables);
    const entries = await loadWindowsProtection(ctx);
    if (!entries) return;
    if (entries.length === 0) return failNoWindowsDevices(ctx);
    const now = Date.now();

    for (const e of entries) {
      if (!e.state) {
        failNoDefenderState(ctx, e);
        continue;
      }
      const name = deviceLabel(e.device);
      const last = lastScan(e);
      const age = daysSince(last, now);
      const evidence = {
        ...protectionEvidence(e),
        lastScan: last,
        daysSinceScan: age,
        thresholdDays: scanMaxDays,
      };
      if (age === null || age > scanMaxDays) {
        ctx.fail({
          title: `Scan overdue: ${name}`,
          description:
            age === null
              ? `Defender on ${name} reports no completed scan.`
              : `Defender on ${name} last completed a scan ${age} days ago; the defined frequency is every ${scanMaxDays} days.`,
          resourceType: 'device',
          resourceId: name,
          severity: 'medium',
          remediation: `Schedule a Defender quick scan at least every ${scanMaxDays} days through the Intune antivirus policy, and confirm the device is powered on when it is due.`,
          evidence,
        });
      } else {
        ctx.pass({
          title: `Scanned within ${scanMaxDays} days: ${name}`,
          description: `Defender on ${name} last completed a scan ${age} days ago.`,
          resourceType: 'device',
          resourceId: name,
          evidence,
        });
      }
    }
  },
};
