import { afterEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (cmd: string, opts: unknown) => execSyncMock(cmd, opts),
}));

import { WindowsFipsModeCheck, parseFipsEnabled } from './fips-mode';
import { WindowsLogForwardingCheck, evaluateLogForwarding } from './log-forwarding';

afterEach(() => execSyncMock.mockReset());

describe('parseFipsEnabled', () => {
  it('reads the DWORD', () => {
    expect(parseFipsEnabled('1\r\n')).toBe(true);
    expect(parseFipsEnabled('0')).toBe(false);
    expect(parseFipsEnabled('')).toBeNull();
    expect(parseFipsEnabled('garbage')).toBeNull();
  });
});

describe('WindowsFipsModeCheck', () => {
  it('passes when the policy is enabled and fails when it is off or missing', async () => {
    const check = new WindowsFipsModeCheck();

    execSyncMock.mockReturnValueOnce('1\r\n');
    const on = await check.run();
    expect(on.checkType).toBe('fips_mode');
    expect(on.passed).toBe(true);
    expect(on.details.message).toContain('is enabled');

    execSyncMock.mockReturnValueOnce('0');
    const off = await check.run();
    expect(off.passed).toBe(false);

    execSyncMock.mockImplementationOnce(() => {
      throw new Error(
        "Cannot find path 'HKLM:\\SYSTEM\\...\\FipsAlgorithmPolicy' because it does not exist.",
      );
    });
    const missing = await check.run();
    expect(missing.passed).toBe(false);
    expect(missing.details.message).toContain('not configured');
  });
});

describe('evaluateLogForwarding', () => {
  it('passes on a running forwarder, names it, and handles the single-object JSON shape', () => {
    const r = evaluateLogForwarding({
      services: {
        Name: 'AzureMonitorAgent',
        DisplayName: 'Azure Monitor Agent',
        Status: 'Running',
      },
      wef: [],
    });
    expect(r.passed).toBe(true);
    expect(r.running).toEqual(['Azure Monitor Agent']);
    expect(r.message).toContain('Azure Monitor Agent');
  });

  it('passes on a Windows Event Forwarding policy alone', () => {
    const r = evaluateLogForwarding({
      services: [],
      wef: 'Server=https://wec.shop.local:5986/wsman/SubscriptionManager/WEC',
    });
    expect(r.passed).toBe(true);
    expect(r.wefTargets).toHaveLength(1);
    expect(r.message).toContain('Windows Event Forwarding');
  });

  it('fails when the only forwarder is stopped, and when nothing is installed', () => {
    const stopped = evaluateLogForwarding({
      services: [{ Name: 'SplunkForwarder', Status: 'Stopped' }],
      wef: null,
    });
    expect(stopped.passed).toBe(false);
    expect(stopped.installedNotRunning).toEqual(['Splunk Universal Forwarder']);
    expect(stopped.message).toContain('installed but stopped');

    const none = evaluateLogForwarding({});
    expect(none.passed).toBe(false);
    expect(none.message).toContain('No log forwarding agent');
  });

  it('treats the numeric enum value 4 as Running', () => {
    expect(evaluateLogForwarding({ services: [{ Name: 'WazuhSvc', Status: 4 }] }).passed).toBe(
      true,
    );
  });
});

describe('WindowsLogForwardingCheck', () => {
  it('sends an encoded command and reports the parsed snapshot', async () => {
    execSyncMock.mockReturnValueOnce(
      JSON.stringify({
        services: [{ Name: 'nxlog', DisplayName: 'nxlog', Status: 'Running' }],
        wef: [],
      }),
    );
    const result = await new WindowsLogForwardingCheck().run();
    expect(execSyncMock.mock.calls[0][0]).toContain('-EncodedCommand ');
    expect(result.checkType).toBe('log_forwarding');
    expect(result.passed).toBe(true);
    expect(result.details.message).toContain('NXLog');
  });

  it('fails safely when PowerShell is unavailable', async () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error('spawn failed');
    });
    const result = await new WindowsLogForwardingCheck().run();
    expect(result.passed).toBe(false);
    expect(result.details.message).toContain('Unable to determine');
  });
});
