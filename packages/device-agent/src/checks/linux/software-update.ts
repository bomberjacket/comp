import type { CheckResult } from '../../shared/types';
import { runCommandCapture } from '../shell';
import type { ComplianceCheck } from '../types';
import { fileExists, fileMtime, readConfigSet } from './files';
import { unitEnabled } from './profile';

/** Days since the last package installation before the device is flagged. */
export const MAX_DAYS_SINCE_INSTALL = 30;

export type PackageManager = 'apt' | 'dnf' | 'yum' | 'zypper' | 'unknown';

export interface PendingPackage {
  name: string;
  version?: string;
  security: boolean;
}

export interface SoftwareUpdateSnapshot {
  manager: PackageManager;
  pending: PendingPackage[];
  listError: string | null;
  /** Epoch ms of the last package database change, a proxy for the last install. */
  lastInstall: number | null;
  /** Unattended-upgrades or dnf-automatic configured and its timer enabled. */
  automatic: boolean | null;
  rebootRequired: boolean;
}

/** `apt list --upgradable`: `openssl/jammy-security 3.0.2-0ubuntu1.15 amd64 [upgradable from: ...]` */
export function parseAptUpgradable(output: string): PendingPackage[] {
  const pending: PendingPackage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = /^([^\s/]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable/.exec(line.trim());
    if (m) pending.push({ name: m[1], version: m[3], security: /security/i.test(m[2]) });
  }
  return pending;
}

/**
 * `dnf -C -q check-update`: `openssl.x86_64  1:3.0.7-24.el9  baseos`; exit 100 when
 * updates exist. Security flags come from `dnf -C -q updateinfo list security`.
 */
export function parseDnfCheckUpdate(output: string, securityList = ''): PendingPackage[] {
  const securityNames = new Set(
    securityList
      .split(/\r?\n/)
      .map(
        (l) =>
          /^\S+\s+\S+\s+(\S+?)-\d/.exec(l.trim())?.[1] ??
          /^\S+\s+\S+\s+([^\s.]+)/.exec(l.trim())?.[1],
      )
      .filter((n): n is string => Boolean(n)),
  );
  const pending: PendingPackage[] = [];
  let inObsoletes = false;
  for (const line of output.split(/\r?\n/)) {
    if (/^Obsoleting Packages/i.test(line)) inObsoletes = true;
    if (inObsoletes) continue;
    const m = /^([A-Za-z0-9_.+-]+)\.(x86_64|aarch64|noarch|i686|ppc64le|s390x)\s+(\S+)\s+\S+/.exec(
      line.trim(),
    );
    if (m) pending.push({ name: m[1], version: m[3], security: securityNames.has(m[1]) });
  }
  return pending;
}

export function evaluateSoftwareUpdate(
  s: SoftwareUpdateSnapshot,
  now = Date.now(),
): {
  passed: boolean;
  daysSinceInstall: number | null;
  security: PendingPackage[];
  message: string;
} {
  const security = s.pending.filter((p) => p.security);
  const daysSinceInstall =
    s.lastInstall === null ? null : Math.floor((now - s.lastInstall) / 86_400_000);
  if (s.manager === 'unknown') {
    return {
      passed: false,
      daysSinceInstall,
      security,
      message: 'Unable to determine the package manager (apt, dnf, yum or zypper not found)',
    };
  }
  if (s.listError && s.pending.length === 0 && s.lastInstall === null) {
    return {
      passed: false,
      daysSinceInstall,
      security,
      message: `Software update status could not be read (${s.manager}: ${s.listError})`,
    };
  }
  const problems: string[] = [];
  if (security.length)
    problems.push(
      `${security.length} security update(s) pending: ${security
        .map((p) => p.name)
        .slice(0, 5)
        .join(', ')}`,
    );
  if (daysSinceInstall === null) problems.push('no package installation recorded');
  else if (daysSinceInstall > MAX_DAYS_SINCE_INSTALL)
    problems.push(`last package installation ${daysSinceInstall} days ago`);
  if (s.rebootRequired) problems.push('a restart is pending to finish installing updates');
  const passed = problems.length === 0;
  const auto =
    s.automatic === true
      ? ', automatic updates on'
      : s.automatic === false
        ? ', automatic updates off'
        : '';
  return {
    passed,
    daysSinceInstall,
    security,
    message: passed
      ? `Up to date (${s.manager}): last installation ${daysSinceInstall} day(s) ago, ${s.pending.length} update(s) pending, none security${auto}`
      : `Updates behind (${s.manager}): ${problems.join('; ')}${auto}`,
  };
}

export function detectPackageManager(): PackageManager {
  if (fileExists('/usr/bin/apt') || fileExists('/usr/bin/apt-get')) return 'apt';
  if (fileExists('/usr/bin/dnf')) return 'dnf';
  if (fileExists('/usr/bin/yum')) return 'yum';
  if (fileExists('/usr/bin/zypper')) return 'zypper';
  return 'unknown';
}

/**
 * NIST SP 800-171 3.14.1: flaws are corrected within the defined time frame.
 * Uses the package manager's cached metadata only (no network): pending
 * packages and which of them are security updates, the last change to the
 * package database as the last-install proxy, the unattended-update
 * configuration, and the distribution's reboot-required marker.
 */
export class LinuxSoftwareUpdateCheck implements ComplianceCheck {
  checkType = 'software_update' as const;
  displayName = 'Software Update';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const manager = detectPackageManager();
    let method = `package manager ${manager}`;
    let pending: PendingPackage[] = [];
    let listError: string | null = null;
    let lastInstall: number | null = null;
    let automatic: boolean | null = null;

    if (manager === 'apt') {
      method = 'apt list --upgradable (cache), dpkg status mtime, unattended-upgrades';
      const list = runCommandCapture('apt list --upgradable 2>/dev/null', 60000);
      pending = parseAptUpgradable(list.output);
      listError = list.exitCode === 0 ? null : list.error;
      lastInstall = fileMtime('/var/lib/dpkg/status');
      const cfg = readConfigSet(null, '/etc/apt/apt.conf.d', [
        'auto-upgrades',
        'unattended-upgrades',
        '20auto-upgrades',
      ]);
      const configured = /APT::Periodic::Unattended-Upgrade\s+"[1-9]/.test(cfg.text);
      const timer = unitEnabled('apt-daily-upgrade.timer');
      automatic = cfg.files.length === 0 && timer === null ? null : configured && timer !== false;
    } else if (manager === 'dnf' || manager === 'yum') {
      const tool = manager;
      method = `${tool} -C check-update (cache), ${tool} updateinfo security, rpm db mtime, ${tool}-automatic`;
      const list = runCommandCapture(`${tool} -C -q check-update 2>/dev/null`, 60000);
      const sec = runCommandCapture(`${tool} -C -q updateinfo list security 2>/dev/null`, 60000);
      pending = parseDnfCheckUpdate(list.output, sec.output);
      // exit 100 means "updates available", 0 means none; anything else is an error
      listError = list.exitCode === 0 || list.exitCode === 100 ? null : list.error;
      lastInstall = fileMtime('/var/lib/rpm/rpmdb.sqlite') ?? fileMtime('/var/lib/rpm/Packages');
      const timer =
        unitEnabled('dnf-automatic.timer') ?? unitEnabled('dnf-automatic-install.timer');
      automatic = timer;
    } else if (manager === 'zypper') {
      method = 'zypper --non-interactive list-patches (cache), rpm db mtime';
      const list = runCommandCapture(
        'zypper --non-interactive --no-refresh list-patches 2>/dev/null',
        60000,
      );
      pending = list.output
        .split(/\r?\n/)
        .filter((l) => /\|\s*(security|recommended|optional)\s*\|/i.test(l))
        .map((l) => {
          const cells = l.split('|').map((c) => c.trim());
          return {
            name: cells[1] ?? 'patch',
            version: cells[0],
            security: /security/i.test(cells[2] ?? ''),
          };
        });
      listError = list.exitCode === 0 ? null : list.error;
      lastInstall = fileMtime('/var/lib/rpm/rpmdb.sqlite') ?? fileMtime('/var/lib/rpm/Packages');
    }

    const snapshot: SoftwareUpdateSnapshot = {
      manager,
      pending,
      listError,
      lastInstall,
      automatic,
      rebootRequired:
        fileExists('/var/run/reboot-required') ||
        runCommandCapture('needs-restarting -r >/dev/null 2>&1; echo $?', 30000).output === '1',
    };
    const result = evaluateSoftwareUpdate(snapshot);
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({
          manager,
          lastInstall: lastInstall === null ? null : new Date(lastInstall).toISOString(),
          pendingCount: pending.length,
          pendingSecurity: result.security.slice(0, 10),
          automatic,
          rebootRequired: snapshot.rebootRequired,
          errors: listError ? [listError] : [],
        }).substring(0, 1800),
        message: result.message,
      },
      checkedAt,
    };
  }
}
