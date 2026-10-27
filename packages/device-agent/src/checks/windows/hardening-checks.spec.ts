import { afterEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (cmd: string, opts: unknown) => execSyncMock(cmd, opts),
}));

vi.mock('../../helper/client', () => ({ askHelper: async () => null }));

import {
  REQUIRED_AUDIT,
  WindowsAuditPolicyCheck,
  evaluateAuditPolicy,
  parseAuditpolCsv,
} from './audit-policy';
import { evaluateTamperProtection } from './defender-tamper';
import { MAX_LOCAL_ADMINS, evaluateLocalAdmins, parseNetLocalGroup } from './local-admins';
import { evaluateRemovableStorage } from './removable-storage';
import { evaluateSmb1 } from './smb1';
import {
  MAX_DAYS_SINCE_INSTALL,
  WindowsUpdateCheck,
  evaluateWindowsUpdate,
} from './windows-update';

afterEach(() => execSyncMock.mockReset());

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

describe('audit policy', () => {
  const csv = (rows: Array<[string, string]>) =>
    ['Machine Name,Policy Target,Subcategory,Subcategory GUID,Inclusion Setting,Exclusion Setting']
      .concat(rows.map(([s, v]) => `LT-01,System,${s},{guid},${v},`))
      .join('\r\n');

  it('parses auditpol CSV and passes when every required subcategory is covered', () => {
    const settings = parseAuditpolCsv(
      csv(REQUIRED_AUDIT.map((r) => [r.subcategory, 'Success and Failure'] as [string, string])),
    );
    expect(settings.get('Logon')).toBe('Success and Failure');
    const r = evaluateAuditPolicy(settings);
    expect(r.passed).toBe(true);
    expect(r.satisfied).toHaveLength(REQUIRED_AUDIT.length);
  });

  it('names the subcategories that fall short of the required success/failure setting', () => {
    const settings = parseAuditpolCsv(
      csv([
        ['Logon', 'Success'],
        ['Account Lockout', 'Failure'],
        ['Process Creation', 'No Auditing'],
      ]),
    );
    const r = evaluateAuditPolicy(settings);
    expect(r.passed).toBe(false);
    expect(r.missing.find((m) => m.subcategory === 'Logon')?.current).toBe('Success');
    expect(r.satisfied).toContain('Account Lockout');
    expect(r.message).toContain('Process Creation (No Auditing)');
  });

  it('reports the elevation requirement when auditpol is denied', async () => {
    execSyncMock.mockImplementationOnce(() => {
      throw new Error('Error 0x00000522 occurred: A required privilege is not held by the client.');
    });
    const result = await new WindowsAuditPolicyCheck().run();
    expect(result.checkType).toBe('audit_policy');
    expect(result.passed).toBe(false);
    expect(result.details.message).toContain('administrator rights');
  });
});

describe('removable storage', () => {
  it('passes on any read/write/all/driver control and fails on execute-only or nothing', () => {
    expect(evaluateRemovableStorage({ diskDenyWrite: 1 }).passed).toBe(true);
    expect(evaluateRemovableStorage({ usbstorStart: '4' }).controls).toEqual([
      'USB mass storage driver disabled',
    ]);
    expect(evaluateRemovableStorage({ mdmDenyWrite: 1, denyAll: 0 }).passed).toBe(true);
    const exec = evaluateRemovableStorage({ diskDenyExecute: 1 });
    expect(exec.passed).toBe(false);
    expect(exec.message).toContain('Only execution');
    expect(evaluateRemovableStorage({}).message).toContain('No policy restricts');
  });
});

describe('SMBv1', () => {
  it('judges from the feature state when readable', () => {
    expect(evaluateSmb1({ featureState: 'DisabledWithPayloadRemoved' }).passed).toBe(true);
    expect(evaluateSmb1({ featureState: 'Enabled', serverSmb1: 0, clientStart: 4 }).passed).toBe(
      true,
    );
    const on = evaluateSmb1({ featureState: 'Enabled', serverSmb1: 1 });
    expect(on.passed).toBe(false);
    expect(on.message).toContain('available');
  });

  it('falls back to registry and the client driver without elevation', () => {
    expect(evaluateSmb1({ featureError: 'elevation', clientServicePresent: false }).passed).toBe(
      true,
    );
    expect(
      evaluateSmb1({
        featureError: 'elevation',
        serverSmb1: 0,
        clientStart: 4,
        clientServicePresent: true,
      }).passed,
    ).toBe(true);
    const bad = evaluateSmb1({
      featureError: 'elevation',
      serverSmb1: 1,
      clientServicePresent: true,
      clientStart: 2,
    });
    expect(bad.passed).toBe(false);
    expect(bad.message).toContain('client driver present');
  });
});

describe('Defender tamper protection', () => {
  it('passes when protected, names the source, and explains passive mode', () => {
    expect(
      evaluateTamperProtection({ IsTamperProtected: true, TamperProtectionSource: 2 }).message,
    ).toContain('Intune');
    expect(evaluateTamperProtection({ IsTamperProtected: false }).passed).toBe(false);
    const passive = evaluateTamperProtection({
      IsTamperProtected: false,
      AMRunningMode: 'Passive Mode',
    });
    expect(passive.passed).toBe(false);
    expect(passive.message).toContain('third-party antivirus');
  });
});

describe('Windows Update', () => {
  it('passes a recently patched device with only optional updates pending', () => {
    const r = evaluateWindowsUpdate({
      lastInstall: ago(5),
      pendingCount: 1,
      pending: { title: 'Driver', severity: '' },
      rebootPending: false,
    });
    expect(r.passed).toBe(true);
    expect(r.daysSinceInstall).toBe(5);
    expect(r.message).toContain('none critical or important');
  });

  it('fails on stale installs, pending security updates and a pending reboot', () => {
    const r = evaluateWindowsUpdate({
      lastInstall: ago(MAX_DAYS_SINCE_INSTALL + 10),
      pending: [
        { title: 'Cumulative Update', severity: 'Critical', kb: '5050000' },
        { title: 'Feature pack', severity: '' },
      ],
      rebootPending: true,
    });
    expect(r.passed).toBe(false);
    expect(r.pendingSecurity).toHaveLength(1);
    expect(r.message).toContain('KB5050000');
    expect(r.message).toContain('restart is pending');
    expect(r.message).toContain(`${MAX_DAYS_SINCE_INSTALL + 10} days ago`);
    expect(evaluateWindowsUpdate({ autoUpdateError: 'x', searchError: 'y' }).message).toContain(
      'could not be read',
    );
  });

  it('runs the encoded script and summarises the snapshot', async () => {
    execSyncMock.mockReturnValueOnce(
      JSON.stringify({ lastInstall: ago(2), pendingCount: 0, pending: [], rebootPending: false }),
    );
    const result = await new WindowsUpdateCheck().run();
    expect(execSyncMock.mock.calls[0][0]).toContain('-EncodedCommand ');
    expect(result.passed).toBe(true);
    expect(JSON.parse(result.details.raw).pendingCount).toBe(0);
  });
});

describe('local administrators', () => {
  it('passes when the signed-in user is not an admin and the group is small', () => {
    const r = evaluateLocalAdmins({
      currentUser: 'SHOP\\alice',
      members: [
        { name: 'LT-01\\Administrator', objectClass: 'User' },
        { name: 'SHOP\\Domain Admins', objectClass: 'Group' },
      ],
    });
    expect(r.passed).toBe(true);
    expect(r.members).toEqual(['LT-01\\Administrator', 'SHOP\\Domain Admins']);
  });

  it('fails when the signed-in user is an admin or the group is too large', () => {
    const me = evaluateLocalAdmins({
      currentUser: 'LT-01\\mike',
      members: { name: 'LT-01\\Mike' },
    });
    expect(me.passed).toBe(false);
    expect(me.currentUserIsAdmin).toBe(true);
    const many = evaluateLocalAdmins({
      currentUser: 'SHOP\\alice',
      members: Array.from({ length: MAX_LOCAL_ADMINS + 1 }, (_, i) => ({
        name: `LT-01\\admin${i}`,
      })),
    });
    expect(many.passed).toBe(false);
    expect(many.message).toContain(`limit ${MAX_LOCAL_ADMINS}`);
  });

  it('falls back to net localgroup output when the cmdlet fails', () => {
    const net = [
      'Alias name     administrators',
      'Comment        Administrators have complete and unrestricted access to the computer/domain',
      '',
      'Members',
      '',
      '-------------------------------------------------------------------------------',
      'Administrator',
      'SHOP\\Helpdesk',
      'The command completed successfully.',
      '',
    ].join('\r\n');
    expect(parseNetLocalGroup(net).map((m) => m.name)).toEqual(['Administrator', 'SHOP\\Helpdesk']);
    const r = evaluateLocalAdmins({
      currentUser: 'SHOP\\alice',
      error: 'orphaned SID',
      netOutput: net,
    });
    expect(r.passed).toBe(true);
    expect(evaluateLocalAdmins({ currentUser: 'x' }).message).toContain('could not be read');
  });
});
