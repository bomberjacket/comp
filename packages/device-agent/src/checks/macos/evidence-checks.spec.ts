import { afterEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (cmd: string, opts: unknown) => execSyncMock(cmd, opts),
}));

import { MacOSFirewallCheck, evaluateFirewall, parseGlobalState, parseOnOff } from './firewall';
import { MacOSGatekeeperCheck, parseGatekeeperStatus } from './gatekeeper';
import { defaultsBool, parseDefaultsDomain, runCommandCapture } from './shell';
import {
  MacOSSoftwareUpdateCheck,
  evaluateSoftwareUpdate,
  parseDefaultsDate,
  parseSoftwareUpdateList,
} from './software-update';
import { MacOSSystemIntegrityProtectionCheck, parseSipStatus } from './system-integrity-protection';

afterEach(() => execSyncMock.mockReset());

/** Simulate execSync's failure: an Error carrying stdout and the exit status. */
const exitWith = (status: number, stdout: string) => {
  const err = new Error(`Command failed (exit ${status})`) as Error & {
    status: number;
    stdout: string;
  };
  err.status = status;
  err.stdout = stdout;
  throw err;
};

const DAY = 86_400_000;

describe('shell helpers', () => {
  it('keeps stdout and the exit code when a command exits non-zero', () => {
    execSyncMock.mockImplementationOnce(() => exitWith(3, 'assessments disabled\n'));
    expect(runCommandCapture('spctl --status')).toEqual({
      output: 'assessments disabled',
      exitCode: 3,
      error: 'Command failed (exit 3)',
    });
  });

  it('parses a defaults domain dump and its booleans', () => {
    const prefs = parseDefaultsDomain(`{
    AutomaticCheckEnabled = 1;
    AutomaticDownload = 0;
    LastSuccessfulDate = "2026-10-25 02:11:40 +0000";
    RecommendedUpdates =     (
    );
    "Quoted-Key" = YES;
}`);
    expect(prefs.AutomaticCheckEnabled).toBe('1');
    expect(prefs.LastSuccessfulDate).toBe('2026-10-25 02:11:40 +0000');
    expect(prefs['Quoted-Key']).toBe('YES');
    expect(prefs.RecommendedUpdates).toBeUndefined();
    expect(defaultsBool('1')).toBe(true);
    expect(defaultsBool('NO')).toBe(false);
    expect(defaultsBool(undefined)).toBeNull();
  });
});

describe('Gatekeeper', () => {
  it('parses both states', () => {
    expect(parseGatekeeperStatus('assessments enabled')).toBe('enabled');
    expect(parseGatekeeperStatus('assessments disabled\n')).toBe('disabled');
    expect(parseGatekeeperStatus('')).toBeNull();
  });

  it('passes when enabled, fails when spctl exits non-zero with "disabled"', async () => {
    const check = new MacOSGatekeeperCheck();
    execSyncMock.mockReturnValueOnce('assessments enabled\n');
    const on = await check.run();
    expect(on.checkType).toBe('gatekeeper');
    expect(on.passed).toBe(true);

    execSyncMock.mockImplementationOnce(() => exitWith(3, 'assessments disabled\n'));
    const off = await check.run();
    expect(off.passed).toBe(false);
    expect(off.details.message).toContain('disabled');
    expect(JSON.parse(off.details.raw).exitCode).toBe(3);

    execSyncMock.mockImplementationOnce(() => exitWith(127, ''));
    const missing = await check.run();
    expect(missing.passed).toBe(false);
    expect(missing.details.message).toContain('Unable to read');
  });
});

describe('System Integrity Protection', () => {
  it('parses enabled, disabled and custom configurations', () => {
    expect(parseSipStatus('System Integrity Protection status: enabled.')).toEqual({
      state: 'enabled',
      disabledParts: [],
    });
    expect(parseSipStatus('System Integrity Protection status: disabled.')?.state).toBe('disabled');
    const custom =
      parseSipStatus(`System Integrity Protection status: unknown (Custom Configuration).

Configuration:
	Apple Internal: disabled
	Kext Signing: enabled
	Filesystem Protections: disabled
	Debugging Restrictions: enabled`);
    expect(custom?.state).toBe('custom');
    expect(custom?.disabledParts).toEqual(['Apple Internal', 'Filesystem Protections']);
    expect(parseSipStatus('garbage')).toBeNull();
  });

  it('only passes on a fully enabled SIP', async () => {
    const check = new MacOSSystemIntegrityProtectionCheck();
    execSyncMock.mockReturnValueOnce('System Integrity Protection status: enabled.\n');
    expect((await check.run()).passed).toBe(true);

    execSyncMock.mockReturnValueOnce(
      'System Integrity Protection status: unknown (Custom Configuration).\n\nConfiguration:\n\tFilesystem Protections: disabled\n',
    );
    const custom = await check.run();
    expect(custom.passed).toBe(false);
    expect(custom.details.message).toContain('Filesystem Protections');

    execSyncMock.mockImplementationOnce(() => {
      throw new Error('spawnSync csrutil ENOENT');
    });
    expect((await check.run()).details.message).toContain('Unable to run csrutil');
  });
});

describe('Host firewall', () => {
  it('parses socketfilterfw output', () => {
    expect(parseGlobalState('Firewall is enabled. (State = 1)')).toBe(1);
    expect(parseGlobalState('Firewall is disabled. (State = 0)')).toBe(0);
    expect(parseGlobalState('Firewall is enabled.')).toBe(1);
    expect(parseGlobalState('')).toBeNull();
    expect(parseOnOff('Stealth mode enabled')).toBe(true);
    expect(parseOnOff('Firewall stealth mode is off')).toBe(false);
    expect(parseOnOff('Block all DISABLED!')).toBe(false);
    expect(parseOnOff('')).toBeNull();
  });

  it('evaluates the three states', () => {
    expect(evaluateFirewall({ globalState: 0, stealthMode: null, blockAll: null }).passed).toBe(
      false,
    );
    const on = evaluateFirewall({ globalState: 1, stealthMode: true, blockAll: false });
    expect(on.passed).toBe(true);
    expect(on.message).toContain('stealth mode on');
    expect(
      evaluateFirewall({ globalState: 2, stealthMode: false, blockAll: true }).message,
    ).toContain('all incoming connections blocked');
    expect(evaluateFirewall({ globalState: null, stealthMode: null, blockAll: null }).passed).toBe(
      false,
    );
  });

  it('runs the three queries and reports', async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes('--getglobalstate')) return 'Firewall is enabled. (State = 1)\n';
      if (cmd.includes('--getstealthmode')) return 'Firewall stealth mode is off\n';
      if (cmd.includes('--getblockall')) return 'Block all DISABLED!\n';
      throw new Error(`unexpected ${cmd}`);
    });
    const result = await new MacOSFirewallCheck().run();
    expect(result.checkType).toBe('host_firewall');
    expect(result.passed).toBe(true);
    expect(JSON.parse(result.details.raw)).toMatchObject({
      globalState: 1,
      stealthMode: false,
      blockAll: false,
    });
  });
});

describe('Software Update', () => {
  const LIST = `Software Update Tool

Finding available software
Software Update found the following new or updated software:
* Label: macOS Sonoma 14.6.1-23G93
\tTitle: macOS Sonoma 14.6.1, Version: 14.6.1, Size: 1234567KiB, Recommended: YES, Action: restart,
* Label: Safari17.6SonomaAuto-17.6
\tTitle: Safari, Version: 17.6, Size: 90000KiB, Recommended: YES,
* Label: Optional Thing-1.0
\tTitle: Optional Thing, Version: 1.0, Size: 1KiB, Recommended: NO,
`;

  it('parses the pending list and defaults dates', () => {
    const updates = parseSoftwareUpdateList(LIST);
    expect(updates).toHaveLength(3);
    expect(updates[0]).toEqual({
      label: 'macOS Sonoma 14.6.1-23G93',
      title: 'macOS Sonoma 14.6.1',
      version: '14.6.1',
      recommended: true,
      action: 'restart',
    });
    expect(updates[2].recommended).toBe(false);
    expect(parseSoftwareUpdateList('No new software available.')).toEqual([]);
    expect(parseDefaultsDate('2026-10-25 02:11:40 +0000')).toBe(Date.UTC(2026, 9, 25, 2, 11, 40));
    expect(parseDefaultsDate(undefined)).toBeNull();
  });

  it('passes a current machine and lists the problems on a stale one', () => {
    const now = Date.UTC(2026, 9, 26);
    const good = evaluateSoftwareUpdate(
      {
        pending: [],
        listError: null,
        prefs: {
          AutomaticCheckEnabled: '1',
          CriticalUpdateInstall: '1',
          LastSuccessfulDate: '2026-10-25 02:11:40 +0000',
        },
      },
      now,
    );
    expect(good.passed).toBe(true);
    expect(good.daysSinceCheck).toBe(0);

    const bad = evaluateSoftwareUpdate(
      {
        pending: parseSoftwareUpdateList(LIST),
        listError: null,
        prefs: {
          AutomaticCheckEnabled: '0',
          CriticalUpdateInstall: '0',
          LastSuccessfulDate: '2026-10-01 02:11:40 +0000',
        },
      },
      now,
    );
    expect(bad.passed).toBe(false);
    expect(bad.recommended).toHaveLength(2);
    expect(bad.message).toContain('2 recommended update(s) pending: macOS Sonoma 14.6.1, Safari');
    expect(bad.message).toContain('last successful update check 24 days ago');
    expect(bad.message).toContain('automatic update checks are off');
    expect(bad.message).toContain('security responses');

    const unreadable = evaluateSoftwareUpdate({ pending: [], listError: 'boom', prefs: {} }, now);
    expect(unreadable.passed).toBe(false);
    expect(unreadable.message).toContain('could not be read');
  });

  it('overlays managed preferences on the system domain', async () => {
    const recent = new Date(Date.now() - DAY)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, ' +0000');
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith('softwareupdate')) return 'No new software available.\n';
      if (cmd.includes('Managed Preferences'))
        return '{\n    AutomaticCheckEnabled = 1;\n    CriticalUpdateInstall = 1;\n}\n';
      if (cmd.startsWith('defaults read /Library/Preferences'))
        return `{\n    AutomaticCheckEnabled = 0;\n    LastSuccessfulDate = "${recent}";\n}\n`;
      throw new Error(`unexpected ${cmd}`);
    });
    const result = await new MacOSSoftwareUpdateCheck().run();
    expect(result.checkType).toBe('software_update');
    expect(result.passed).toBe(true);
    const raw = JSON.parse(result.details.raw);
    expect(raw.managedByProfile).toBe(true);
    expect(raw.automaticCheck).toBe('1');
  });

  it('treats a missing managed domain as not managed and still evaluates', async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith('softwareupdate')) return 'No new software available.\n';
      if (cmd.includes('Managed Preferences')) exitWith(1, '');
      return '{\n    AutomaticCheckEnabled = 1;\n    CriticalUpdateInstall = 1;\n}\n';
    });
    const result = await new MacOSSoftwareUpdateCheck().run();
    expect(result.passed).toBe(false);
    expect(result.details.message).toContain('no successful update check recorded');
    expect(JSON.parse(result.details.raw).managedByProfile).toBe(false);
  });
});
