import type { CheckResult } from '../../shared/types';
import { runCommandCapture } from '../shell';
import type { ComplianceCheck } from '../types';
import { readText } from './files';

/** Same ceiling as the Windows check: a workstation or small server needs few admins. */
export const MAX_LOCAL_ADMINS = 3;

/** Groups whose members can become root through sudo on the common distributions. */
export const ADMIN_GROUPS = ['sudo', 'wheel', 'admin'];

export interface LocalAdminsSnapshot {
  /** group name -> members, from getent. */
  groups: Record<string, string[]>;
  /** Accounts with uid 0 other than root, from /etc/passwd. */
  extraRootAccounts: string[];
  currentUser: string | null;
  /** Lines from sudoers granting ALL without a password, when readable. */
  nopasswdRules: string[] | null;
}

/** `getent group sudo wheel` prints `name:x:gid:member,member`. */
export function parseGetentGroups(output: string): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(':');
    if (parts.length < 4) continue;
    groups[parts[0]] = parts[3]
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return groups;
}

export function parseExtraRootAccounts(passwd: string | null): string[] {
  if (!passwd) return [];
  return passwd
    .split(/\r?\n/)
    .map((l) => l.split(':'))
    .filter((f) => f.length >= 3 && f[2] === '0' && f[0] !== 'root')
    .map((f) => f[0]);
}

export function parseNopasswd(sudoers: string | null): string[] | null {
  if (sudoers === null) return null;
  return sudoers
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /NOPASSWD:\s*ALL/.test(l));
}

export function evaluateLocalAdmins(s: LocalAdminsSnapshot): {
  passed: boolean;
  admins: string[];
  message: string;
} {
  const admins = [...new Set(Object.values(s.groups).flat())].sort();
  const problems: string[] = [];
  if (s.currentUser && (admins.includes(s.currentUser) || s.currentUser === 'root'))
    problems.push(`the agent runs as ${s.currentUser}, an administrator`);
  if (admins.length > MAX_LOCAL_ADMINS)
    problems.push(`${admins.length} sudo-capable accounts (limit ${MAX_LOCAL_ADMINS})`);
  if (s.extraRootAccounts.length > 0)
    problems.push(`extra uid 0 account(s): ${s.extraRootAccounts.join(', ')}`);
  if (s.nopasswdRules && s.nopasswdRules.length > 0)
    problems.push(`${s.nopasswdRules.length} sudoers rule(s) grant ALL without a password`);
  const passed = problems.length === 0;
  const members = admins.length ? admins.join(', ') : 'none';
  return {
    passed,
    admins,
    message: passed
      ? `Least privilege: ${admins.length} sudo-capable account(s) (${members}), no extra root accounts`
      : `Least privilege not met: ${problems.join('; ')}. Sudo-capable: ${members}`,
  };
}

/**
 * NIST SP 800-171 3.1.6: non-privileged accounts for non-security functions.
 * Reads the sudo-capable groups through getent, extra uid 0 accounts from
 * /etc/passwd, and sudoers NOPASSWD rules when the file is readable (it is
 * root-only by default, so that part is best effort).
 */
export class LinuxLocalAdminsCheck implements ComplianceCheck {
  checkType = 'local_admins' as const;
  displayName = 'Local Administrators';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'getent group sudo/wheel/admin, /etc/passwd uid 0, sudoers NOPASSWD';
    const getent = runCommandCapture(`getent group ${ADMIN_GROUPS.join(' ')} 2>/dev/null`, 10000);
    const who = runCommandCapture('id -un 2>/dev/null', 10000).output;
    const sudoers = readText('/etc/sudoers');
    const snapshot: LocalAdminsSnapshot = {
      groups: parseGetentGroups(getent.output),
      extraRootAccounts: parseExtraRootAccounts(readText('/etc/passwd').text),
      currentUser: who || null,
      nopasswdRules: parseNopasswd(sudoers.text),
    };
    const result = evaluateLocalAdmins(snapshot);
    const note = sudoers.error
      ? ' (sudoers not readable without root; NOPASSWD rules not checked)'
      : '';
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({ ...snapshot, sudoersError: sudoers.error }).substring(0, 1800),
        message: result.message + note,
      },
      checkedAt,
    };
  }
}
