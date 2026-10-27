import { describe, expect, it } from 'vitest';
import type { DeviceWithChecks } from '../types';
import { extendedChecks } from './device-source';

const device = (checkDetails: DeviceWithChecks['checkDetails']): DeviceWithChecks =>
  ({
    id: 'dev_1',
    name: 'LT-01',
    hostname: 'lt-01',
    platform: 'windows',
    osVersion: '10.0.26300.9711',
    serialNumber: null,
    hardwareModel: null,
    isCompliant: true,
    diskEncryptionEnabled: true,
    antivirusEnabled: true,
    passwordPolicySet: true,
    screenLockEnabled: true,
    checkDetails,
    lastCheckIn: null,
    agentVersion: '1.0.0',
    installedAt: '2026-10-01T00:00:00.000Z',
    user: { name: 'Alice', email: 'alice@shop.com' },
    source: 'device_agent',
    complianceStatus: 'compliant',
    daysSinceLastCheckIn: 0,
    hasActiveAgentSession: true,
  }) as DeviceWithChecks;

describe('extendedChecks', () => {
  it('returns only the non-canonical checks, labelled and sorted, with their objective', () => {
    const checks = extendedChecks(
      device({
        disk_encryption: { passed: true, message: 'BitLocker on' },
        log_forwarding: {
          passed: true,
          message: 'Log forwarding active (running: Azure Monitor Agent)',
        },
        fips_mode: {
          passed: false,
          message: 'FIPS algorithm policy is not configured',
          checkedAt: '2026-10-26T12:00:00.000Z',
        },
        smb_v1_disabled: { passed: true },
      }),
    );
    expect(checks.map((c) => [c.id, c.label, c.objective, c.passed])).toEqual([
      ['fips_mode', 'FIPS Mode', '3.13.11', false],
      ['log_forwarding', 'Log Forwarding', '3.3.1', true],
      ['smb_v1_disabled', 'Smb V1 Disabled', null, true],
    ]);
    expect(checks[0].checkedAt).toBe('2026-10-26T12:00:00.000Z');
  });

  it('is empty for devices with no details or only canonical checks', () => {
    expect(extendedChecks(device(null))).toEqual([]);
    expect(extendedChecks(device({ antivirus: { passed: true } }))).toEqual([]);
  });
});
