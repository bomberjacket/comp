import { afterEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (cmd: string, opts: unknown) => execSyncMock(cmd, opts),
}));

/** A fake filesystem: path -> contents (string), or 'EACCES' for a root-only file. */
let files: Record<string, string> = {};
let mtimes: Record<string, number> = {};
vi.mock('./files', () => {
  const readText = (file: string) => {
    const v = files[file];
    if (v === undefined) return { text: null, error: null };
    if (v === 'EACCES') return { text: null, error: `EACCES: ${file}` };
    return { text: v, error: null };
  };
  const listFiles = (dir: string, suffixes: string[]) =>
    Object.keys(files)
      .filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/'))
      .filter((f) => suffixes.some((s) => f.endsWith(s)))
      .sort();
  return {
    readText,
    listFiles,
    fileExists: (file: string) => files[file] !== undefined,
    fileMtime: (file: string) => mtimes[file] ?? null,
    readConfigSet: (main: string | null, dir: string | null, suffixes: string[]) => {
      const list = [...(main ? [main] : []), ...(dir ? listFiles(dir, suffixes) : [])];
      const parts: string[] = [];
      const errors: string[] = [];
      const read: string[] = [];
      for (const f of list) {
        const r = readText(f);
        if (r.text !== null) {
          parts.push(r.text);
          read.push(f);
        } else if (r.error) errors.push(r.error);
      }
      return { text: parts.join('\n'), files: read, errors };
    },
  };
});

import {
  LinuxAuditPolicyCheck,
  evaluateAuditPolicy,
  evaluateAuditRules,
  parseRules,
} from './audit-policy';
import { LinuxFipsModeCheck, parseFipsFlag } from './fips-mode';
import { LinuxFirewallCheck, evaluateFirewall } from './firewall';
import {
  LinuxLocalAdminsCheck,
  evaluateLocalAdmins,
  parseExtraRootAccounts,
  parseGetentGroups,
  parseNopasswd,
} from './local-admins';
import {
  LinuxLogForwardingCheck,
  evaluateLogForwarding,
  parseJournalUploadUrl,
  parseSyslogTargets,
} from './log-forwarding';
import { detectLinuxProfile, unitState } from './profile';
import { LinuxScreenLockCheck } from './screen-lock';
import {
  LinuxSoftwareUpdateCheck,
  evaluateSoftwareUpdate,
  parseAptUpgradable,
  parseDnfCheckUpdate,
} from './software-update';
import { LinuxSshHardeningCheck, evaluateSshd, parseSshdConfig } from './ssh-hardening';

afterEach(() => {
  execSyncMock.mockReset();
  files = {};
  mtimes = {};
});

const exitWith = (status: number, stdout: string): never => {
  const err = new Error(`Command failed (exit ${status})`) as Error & {
    status: number;
    stdout: string;
  };
  err.status = status;
  err.stdout = stdout;
  throw err;
};

/** Answer systemctl is-active/is-enabled from a table; everything else via `other`. */
function systemd(
  active: string[],
  installed: string[] = [],
  other: (cmd: string) => string = () => '',
) {
  execSyncMock.mockImplementation((cmd: string) => {
    const m = /^systemctl is-(active|enabled) (\S+)/.exec(cmd);
    if (m) {
      const unit = m[2].replace(/\.service$/, '');
      if (m[1] === 'active') return active.includes(unit) ? 'active\n' : exitWith(3, 'inactive\n');
      if (active.includes(unit) || installed.includes(unit)) return 'enabled\n';
      return exitWith(1, '');
    }
    return other(cmd);
  });
}

const DAY = 86_400_000;

describe('profile', () => {
  it('reads unit states from systemctl', () => {
    systemd(['auditd'], ['ufw']);
    expect(unitState('auditd')).toBe('active');
    expect(unitState('ufw')).toBe('inactive');
    expect(unitState('firewalld')).toBe('missing');
  });

  it('detects a headless server and a desktop', () => {
    systemd([], [], (cmd) =>
      cmd.startsWith('systemctl get-default') ? 'multi-user.target\n' : '',
    );
    const server = detectLinuxProfile({});
    expect(server.headless).toBe(true);
    systemd(['display-manager'], [], (cmd) =>
      cmd.startsWith('systemctl get-default') ? 'graphical.target\n' : '',
    );
    expect(detectLinuxProfile({ DISPLAY: ':0' }).headless).toBe(false);
  });

  it('marks screen lock not applicable on a headless server', async () => {
    systemd([], [], (cmd) =>
      cmd.startsWith('systemctl get-default') ? 'multi-user.target\n' : '',
    );
    const saved = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY };
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    try {
      const result = await new LinuxScreenLockCheck().run();
      expect(result.passed).toBe(true);
      expect(result.details.method).toBe('headless-server-profile');
      expect(result.details.exception).toContain('headless server');
    } finally {
      if (saved.DISPLAY !== undefined) process.env.DISPLAY = saved.DISPLAY;
      if (saved.WAYLAND_DISPLAY !== undefined) process.env.WAYLAND_DISPLAY = saved.WAYLAND_DISPLAY;
    }
  });
});

describe('FIPS mode', () => {
  it('reads the kernel flag', async () => {
    expect(parseFipsFlag('1\n')).toBe(true);
    expect(parseFipsFlag('0')).toBe(false);
    expect(parseFipsFlag(null)).toBeNull();
    files['/proc/sys/crypto/fips_enabled'] = '1\n';
    execSyncMock.mockReturnValue('FIPS mode is enabled.\n');
    const on = await new LinuxFipsModeCheck().run();
    expect(on.passed).toBe(true);
    expect(on.details.message).toContain('FIPS mode is enabled.');
    files = {};
    execSyncMock.mockImplementation(() => exitWith(127, ''));
    const absent = await new LinuxFipsModeCheck().run();
    expect(absent.passed).toBe(false);
    expect(absent.details.message).toContain('absent');
  });
});

describe('Host firewall', () => {
  it('evaluates active, installed-but-stopped and absent', () => {
    expect(
      evaluateFirewall({
        units: { firewalld: 'active', ufw: 'missing' },
        firewalldState: 'running',
        ufwStatus: null,
        nftRules: 12,
      }).message,
    ).toBe('Host firewall active: firewalld, 12 nftables rule(s) loaded');
    const stopped = evaluateFirewall({
      units: { ufw: 'inactive', firewalld: 'missing' },
      firewalldState: null,
      ufwStatus: null,
      nftRules: null,
    });
    expect(stopped.passed).toBe(false);
    expect(stopped.message).toContain('ufw (inactive)');
    expect(
      evaluateFirewall({
        units: { ufw: 'missing' },
        firewalldState: null,
        ufwStatus: null,
        nftRules: null,
      }).message,
    ).toContain('No host firewall');
  });

  it('runs against systemd', async () => {
    systemd(['ufw'], [], (cmd) =>
      cmd.startsWith('ufw status') ? 'Status: active\n' : exitWith(1, ''),
    );
    const result = await new LinuxFirewallCheck().run();
    expect(result.checkType).toBe('host_firewall');
    expect(result.passed).toBe(true);
    expect(result.details.message).toContain('ufw');
  });
});

describe('Audit policy', () => {
  const CIS_RULES = `
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k scope
-w /var/log/lastlog -p wa -k logins
-w /var/run/faillock -p wa -k logins
-w /var/run/utmp -p wa -k session
-a always,exit -F arch=b64 -S adjtimex,settimeofday,clock_settime -k time-change
-a always,exit -F arch=b64 -S execve -C uid!=euid -F euid=0 -k privileged
-a always,exit -F arch=b64 -S init_module,delete_module -k modules
-a always,exit -F arch=b64 -S chmod,fchmod,chown -F auid>=1000 -k perm_mod
-a always,exit -F arch=b64 -S unlink,rename -F auid>=1000 -k delete
-a always,exit -F arch=b64 -S mount -F auid>=1000 -k mounts
-a always,exit -F arch=b64 -S sethostname,setdomainname -k system-locale
-w /etc/selinux/ -p wa -k MAC-policy
-w /etc/audit/ -p wa -k auditconfig
-e 2
`;

  it('scores rule coverage', () => {
    const full = evaluateAuditRules(parseRules(CIS_RULES));
    expect(full.missing).toEqual([]);
    const partial = evaluateAuditRules(parseRules('-w /etc/passwd -p wa -k identity'));
    expect(partial.covered).toEqual(['Identity files (passwd, group, shadow)']);
    expect(partial.missing).toHaveLength(12);
  });

  it('explains missing auditd, unreadable rules, and labels configured rules', () => {
    expect(
      evaluateAuditPolicy({
        auditd: 'missing',
        source: 'none',
        rules: [],
        immutable: false,
        files: [],
        errors: [],
      }).message,
    ).toContain('not installed');
    expect(
      evaluateAuditPolicy({
        auditd: 'active',
        source: 'none',
        rules: [],
        immutable: false,
        files: [],
        errors: ['EACCES'],
      }).message,
    ).toContain('not readable without root');
    const cfg = evaluateAuditPolicy({
      auditd: 'active',
      source: 'configured',
      rules: parseRules(CIS_RULES),
      immutable: true,
      files: ['/etc/audit/rules.d/cis.rules'],
      errors: [],
    });
    expect(cfg.passed).toBe(true);
    expect(cfg.message).toContain('configured rules files');
    expect(cfg.message).toContain('immutable');
  });

  it('falls back to the rules files when auditctl needs root', async () => {
    files['/etc/audit/rules.d/50-cis.rules'] = CIS_RULES;
    systemd(['auditd'], [], (cmd) =>
      cmd.startsWith('auditctl -l') ? exitWith(1, 'You must be root to run this program.') : '',
    );
    const result = await new LinuxAuditPolicyCheck().run();
    expect(result.passed).toBe(true);
    expect(result.details.method).toContain('configured, not loaded');
    expect(JSON.parse(result.details.raw).source).toBe('configured');
  });

  it('uses the loaded rules when auditctl answers', async () => {
    systemd(['auditd'], [], (cmd) =>
      cmd.startsWith('auditctl -l')
        ? '-w /etc/passwd -p wa -k identity\n'
        : cmd.startsWith('auditctl -s')
          ? 'enabled 2\n'
          : '',
    );
    const result = await new LinuxAuditPolicyCheck().run();
    expect(result.passed).toBe(false);
    expect(result.details.message).toContain('1 of 13');
    expect(JSON.parse(result.details.raw)).toMatchObject({ source: 'effective', immutable: true });
  });
});

describe('Log forwarding', () => {
  it('finds rsyslog, omfwd and syslog-ng targets and ignores loopback', () => {
    expect(
      parseSyslogTargets(`
# comment
*.* @@siem.shop.local:6514
auth.* @10.0.0.5
action(type="omfwd" target="collector.example.com" port="514" protocol="tcp")
destination d_siem { network("siem2.example.com" port(601) transport("tls")); };
*.* @@127.0.0.1:514
`),
    ).toEqual([
      'siem.shop.local:6514',
      '10.0.0.5',
      'collector.example.com:514',
      'siem2.example.com:601',
    ]);
    expect(parseJournalUploadUrl('[Upload]\nURL=https://logs.example.com:19532\n')).toBe(
      'https://logs.example.com:19532',
    );
  });

  it('evaluates agents, syslog and journal upload', () => {
    expect(
      evaluateLogForwarding({
        units: { 'wazuh-agent': 'active' },
        syslogTargets: [],
        syslogDaemon: 'missing',
        journalUploadUrl: null,
      }).message,
    ).toBe('Logs are forwarded: Wazuh agent running');
    const syslogOnly = evaluateLogForwarding({
      units: {},
      syslogTargets: ['siem:514'],
      syslogDaemon: 'active',
      journalUploadUrl: null,
    });
    expect(syslogOnly.passed).toBe(true);
    const broken = evaluateLogForwarding({
      units: { filebeat: 'failed' },
      syslogTargets: ['siem:514'],
      syslogDaemon: 'inactive',
      journalUploadUrl: null,
    });
    expect(broken.passed).toBe(false);
    expect(broken.message).toContain('Elastic Filebeat (failed)');
    expect(broken.message).toContain('syslog daemon is inactive');
    expect(
      evaluateLogForwarding({
        units: {},
        syslogTargets: [],
        syslogDaemon: 'missing',
        journalUploadUrl: null,
      }).message,
    ).toContain('No log forwarding');
  });

  it('runs against config files and systemd', async () => {
    files['/etc/rsyslog.conf'] = 'module(load="imuxsock")\n';
    files['/etc/rsyslog.d/90-siem.conf'] = '*.* @@siem.shop.local:6514\n';
    systemd(['rsyslog']);
    const result = await new LinuxLogForwardingCheck().run();
    expect(result.passed).toBe(true);
    expect(result.details.message).toContain('siem.shop.local:6514');
  });
});

describe('Software update', () => {
  it('parses apt and dnf output', () => {
    const apt = parseAptUpgradable(`Listing... Done
openssl/jammy-security 3.0.2-0ubuntu1.15 amd64 [upgradable from: 3.0.2-0ubuntu1.14]
vim/jammy-updates 2:8.2.3995-1ubuntu2.16 amd64 [upgradable from: 2:8.2.3995-1ubuntu2.15]
`);
    expect(apt).toEqual([
      { name: 'openssl', version: '3.0.2-0ubuntu1.15', security: true },
      { name: 'vim', version: '2:8.2.3995-1ubuntu2.16', security: false },
    ]);
    const dnf = parseDnfCheckUpdate(
      `
openssl.x86_64                    1:3.0.7-24.el9                   baseos
kernel.x86_64                     5.14.0-362.el9                   baseos
Obsoleting Packages
foo.x86_64  1.0  appstream
`,
      'RHSA-2024:1234 Important/Sec. openssl-1:3.0.7-24.el9.x86_64\n',
    );
    expect(dnf).toEqual([
      { name: 'openssl', version: '1:3.0.7-24.el9', security: true },
      { name: 'kernel', version: '5.14.0-362.el9', security: false },
    ]);
  });

  it('evaluates current and stale hosts', () => {
    const now = Date.UTC(2026, 9, 26);
    const good = evaluateSoftwareUpdate(
      {
        manager: 'apt',
        pending: [{ name: 'vim', security: false }],
        listError: null,
        lastInstall: now - 3 * DAY,
        automatic: true,
        rebootRequired: false,
      },
      now,
    );
    expect(good.passed).toBe(true);
    expect(good.message).toContain('automatic updates on');
    const bad = evaluateSoftwareUpdate(
      {
        manager: 'dnf',
        pending: [{ name: 'openssl', security: true }],
        listError: null,
        lastInstall: now - 45 * DAY,
        automatic: false,
        rebootRequired: true,
      },
      now,
    );
    expect(bad.passed).toBe(false);
    expect(bad.message).toContain('1 security update(s) pending: openssl');
    expect(bad.message).toContain('45 days ago');
    expect(bad.message).toContain('restart is pending');
    expect(
      evaluateSoftwareUpdate({
        manager: 'unknown',
        pending: [],
        listError: null,
        lastInstall: null,
        automatic: null,
        rebootRequired: false,
      }).message,
    ).toContain('package manager');
  });

  it('runs the apt path with unattended-upgrades on', async () => {
    files['/usr/bin/apt'] = '';
    files['/etc/apt/apt.conf.d/20auto-upgrades'] =
      'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n';
    mtimes['/var/lib/dpkg/status'] = Date.now() - 2 * DAY;
    systemd(['apt-daily-upgrade.timer'], [], (cmd) =>
      cmd.startsWith('apt list')
        ? 'Listing... Done\n'
        : cmd.startsWith('needs-restarting')
          ? '0\n'
          : '',
    );
    const result = await new LinuxSoftwareUpdateCheck().run();
    expect(result.checkType).toBe('software_update');
    expect(result.passed).toBe(true);
    expect(JSON.parse(result.details.raw)).toMatchObject({
      manager: 'apt',
      automatic: true,
      pendingCount: 0,
    });
  });

  it('treats dnf exit 100 as updates available, not an error', async () => {
    files['/usr/bin/dnf'] = '';
    mtimes['/var/lib/rpm/rpmdb.sqlite'] = Date.now() - DAY;
    systemd([], [], (cmd) =>
      cmd.includes('check-update')
        ? exitWith(100, 'openssl.x86_64  1:3.0.7-24.el9  baseos\n')
        : cmd.includes('updateinfo')
          ? 'RHSA-2024:1234 Important/Sec. openssl-1:3.0.7-24.el9.x86_64\n'
          : cmd.startsWith('needs-restarting')
            ? '0\n'
            : '',
    );
    const result = await new LinuxSoftwareUpdateCheck().run();
    expect(result.passed).toBe(false);
    expect(result.details.message).toContain('openssl');
    expect(JSON.parse(result.details.raw).errors).toEqual([]);
  });
});

describe('Local administrators', () => {
  it('parses getent, passwd and sudoers', () => {
    expect(parseGetentGroups('sudo:x:27:mike,ops\nwheel:x:10:\n')).toEqual({
      sudo: ['mike', 'ops'],
      wheel: [],
    });
    expect(
      parseExtraRootAccounts(
        'root:x:0:0:root:/root:/bin/bash\ntoor:x:0:0::/:/bin/sh\nmike:x:1000:1000::/home/mike:/bin/bash\n',
      ),
    ).toEqual(['toor']);
    expect(
      parseNopasswd('# comment\n%sudo ALL=(ALL:ALL) ALL\nops ALL=(ALL) NOPASSWD: ALL\n'),
    ).toHaveLength(1);
    expect(parseNopasswd(null)).toBeNull();
  });

  it('evaluates least privilege', () => {
    const ok = evaluateLocalAdmins({
      groups: { sudo: ['mike'] },
      extraRootAccounts: [],
      currentUser: 'compagent',
      nopasswdRules: null,
    });
    expect(ok.passed).toBe(true);
    const bad = evaluateLocalAdmins({
      groups: { sudo: ['a', 'b', 'c', 'd'], wheel: ['a'] },
      extraRootAccounts: ['toor'],
      currentUser: 'a',
      nopasswdRules: ['a ALL=(ALL) NOPASSWD: ALL'],
    });
    expect(bad.passed).toBe(false);
    expect(bad.message).toContain('runs as a, an administrator');
    expect(bad.message).toContain('4 sudo-capable accounts');
    expect(bad.message).toContain('toor');
    expect(bad.message).toContain('without a password');
  });

  it('notes an unreadable sudoers', async () => {
    files['/etc/passwd'] = 'root:x:0:0:root:/root:/bin/bash\n';
    files['/etc/sudoers'] = 'EACCES';
    execSyncMock.mockImplementation((cmd: string) =>
      cmd.startsWith('getent') ? 'sudo:x:27:mike\n' : 'compagent\n',
    );
    const result = await new LinuxLocalAdminsCheck().run();
    expect(result.passed).toBe(true);
    expect(result.details.message).toContain('sudoers not readable without root');
  });
});

describe('SSH hardening', () => {
  it('parses sshd config with first-value-wins and skips Match blocks', () => {
    const s = parseSshdConfig(`
# drop-in first
PasswordAuthentication no
PermitRootLogin no
Banner /etc/issue.net
ClientAliveInterval 300
ClientAliveCountMax 2
PasswordAuthentication yes
Match User backup
    PasswordAuthentication yes
    PermitRootLogin yes
`);
    expect(s).toEqual({
      passwordAuthentication: 'no',
      permitRootLogin: 'no',
      banner: '/etc/issue.net',
      clientAliveInterval: 300,
      clientAliveCountMax: 2,
    });
    expect(
      parseSshdConfig('permitrootlogin prohibit-password\nmaxauthtries 4\n').maxAuthTries,
    ).toBe(4);
  });

  it('evaluates defaults as not hardened and a CIS config as hardened', () => {
    const defaults = evaluateSshd({}, 'active');
    expect(defaults.passed).toBe(false);
    expect(defaults.problems).toEqual([
      'PasswordAuthentication yes (password-only remote access; keys or MFA expected)',
      'no Banner (system use notification, 3.1.9)',
      'no idle timeout (ClientAliveInterval 0, 3.1.11)',
    ]);
    const hardened = evaluateSshd(
      {
        permitRootLogin: 'no',
        passwordAuthentication: 'no',
        banner: '/etc/issue.net',
        clientAliveInterval: 300,
        clientAliveCountMax: 3,
      },
      'active',
    );
    expect(hardened.passed).toBe(true);
    expect(hardened.message).toContain('idle timeout 900s');
    expect(
      evaluateSshd(
        { permitRootLogin: 'yes', clientAliveInterval: 600, clientAliveCountMax: 3 },
        'active',
      ).problems,
    ).toContain('idle timeout 1800s exceeds 900s (3.1.11)');
  });

  it('is not applicable when OpenSSH server is absent, and reads drop-ins before the main file', async () => {
    systemd([]);
    const absent = await new LinuxSshHardeningCheck().run();
    expect(absent.passed).toBe(true);
    expect(absent.details.exception).toContain('not installed');

    files['/etc/ssh/sshd_config'] =
      'Include /etc/ssh/sshd_config.d/*.conf\nPasswordAuthentication yes\nPermitRootLogin yes\n';
    files['/etc/ssh/sshd_config.d/50-cloud.conf'] =
      'PasswordAuthentication no\nPermitRootLogin no\nBanner /etc/issue.net\nClientAliveInterval 300\nClientAliveCountMax 2\n';
    systemd(['sshd'], [], (cmd) => (cmd.startsWith('sshd -T') ? exitWith(1, '') : ''));
    const result = await new LinuxSshHardeningCheck().run();
    expect(result.checkType).toBe('ssh_hardening');
    expect(result.passed).toBe(true);
    expect(result.details.method).toContain('first value wins');
  });
});
