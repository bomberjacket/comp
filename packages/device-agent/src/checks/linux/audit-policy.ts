import type { CheckResult } from '../../shared/types';
import { needsRoot, runCommandCapture } from '../shell';
import type { ComplianceCheck } from '../types';
import { readConfigSet } from './files';
import { type UnitState, unitState } from './profile';

/**
 * Event categories NIST SP 800-171 3.3.1 expects an audit record for, each
 * with a matcher over auditd rule lines (`auditctl -l` output or rules files).
 * The patterns accept the CIS, DISA STIG and Ubuntu usg rule spellings.
 */
export const REQUIRED_AUDIT_RULES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'Identity files (passwd, group, shadow)',
    pattern: /-w\s+\/etc\/(passwd|shadow|group|gshadow)\b/,
  },
  { name: 'Sudoers changes', pattern: /-w\s+\/etc\/sudoers/ },
  {
    name: 'Login and logout events',
    pattern: /-w\s+\/var\/(log\/(lastlog|faillog|tallylog|wtmp|btmp)|run\/faillock)/,
  },
  { name: 'Session initiation', pattern: /-w\s+\/var\/run\/utmp/ },
  {
    name: 'Time changes',
    pattern: /-S\s+(adjtimex|settimeofday|clock_settime|stime)\b|-w\s+\/etc\/localtime/,
  },
  {
    name: 'Privileged command execution',
    pattern: /-S\s+execve\b.*(euid=0|-F\s+perm=x)|-F\s+perm=x.*-F\s+auid>=/,
  },
  {
    name: 'Kernel module loading',
    pattern:
      /-S\s+(init_module|finit_module|delete_module)\b|-w\s+\/(usr\/)?s?bin\/(insmod|rmmod|modprobe|kmod)\b/,
  },
  {
    name: 'Permission and ownership changes',
    pattern:
      /-S\s+(chmod|fchmod|fchmodat|chown|fchown|lchown|fchownat|setxattr|lsetxattr|fsetxattr|removexattr)\b/,
  },
  { name: 'File deletion', pattern: /-S\s+(unlink|unlinkat|rename|renameat)\b/ },
  { name: 'Mount events', pattern: /-S\s+(mount|umount2?)\b/ },
  {
    name: 'Network configuration',
    pattern:
      /-S\s+(sethostname|setdomainname)\b|-w\s+\/etc\/(hosts|issue|network|sysconfig\/network|netplan)/,
  },
  { name: 'MAC policy changes (SELinux or AppArmor)', pattern: /-w\s+\/etc\/(selinux|apparmor)/ },
  {
    name: 'Audit configuration itself',
    pattern: /-w\s+\/(etc\/audit|var\/log\/audit|sbin\/auditctl|sbin\/auditd)/,
  },
];

export type AuditRulesSource = 'effective' | 'configured' | 'none';

export interface AuditPolicySnapshot {
  auditd: UnitState;
  source: AuditRulesSource;
  rules: string[];
  /** `-e 2` makes the loaded rules immutable until reboot. */
  immutable: boolean;
  files: string[];
  errors: string[];
}

export function parseRules(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function evaluateAuditRules(rules: string[]): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const req of REQUIRED_AUDIT_RULES) {
    (rules.some((r) => req.pattern.test(r)) ? covered : missing).push(req.name);
  }
  return { covered, missing };
}

export function evaluateAuditPolicy(s: AuditPolicySnapshot): { passed: boolean; message: string } {
  if (s.auditd === 'missing') {
    return { passed: false, message: 'auditd is not installed: no audit records are generated' };
  }
  if (s.auditd !== 'active') {
    return { passed: false, message: `auditd is ${s.auditd}: audit rules are not being applied` };
  }
  if (s.source === 'none') {
    const why = s.errors.length
      ? 'rules files are not readable without root and auditctl is denied'
      : 'no rules are loaded or configured';
    return {
      passed: false,
      message: `auditd is running but the audit rules could not be read: ${why}`,
    };
  }
  const { covered, missing } = evaluateAuditRules(s.rules);
  const total = REQUIRED_AUDIT_RULES.length;
  const label = s.source === 'configured' ? ' (configured rules files, not the loaded set)' : '';
  const imm = s.immutable ? ', rules immutable (-e 2)' : '';
  if (missing.length === 0) {
    return {
      passed: true,
      message: `auditd running; rules cover all ${total} required event categories${label}${imm}`,
    };
  }
  return {
    passed: false,
    message: `auditd running; rules cover ${covered.length} of ${total} required event categories${label}; missing: ${missing.join(', ')}`,
  };
}

/**
 * NIST SP 800-171 3.3.1: system audit records for the defined events.
 * Order: auditd state from systemd; the loaded rules from `auditctl -l`
 * (root only); else the configured rules under /etc/audit (readable on Debian
 * and Ubuntu, root-only on RHEL), labelled as configured rather than loaded;
 * else an honest error.
 */
export class LinuxAuditPolicyCheck implements ComplianceCheck {
  checkType = 'audit_policy' as const;
  displayName = 'Audit Policy';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const auditd = unitState('auditd');
    const loaded = runCommandCapture('auditctl -l 2>&1', 15000);
    let snapshot: AuditPolicySnapshot;
    let method: string;
    if (loaded.exitCode === 0 && loaded.output && !needsRoot(loaded.output)) {
      const rules = parseRules(loaded.output).filter((r) => r !== 'No rules');
      const status = runCommandCapture('auditctl -s 2>/dev/null', 10000).output;
      snapshot = {
        auditd,
        source: rules.length ? 'effective' : 'none',
        rules,
        immutable: /enabled\s+2/.test(status),
        files: [],
        errors: [],
      };
      method = 'systemctl is-active auditd, auditctl -l (loaded rules)';
    } else {
      const cfg = readConfigSet('/etc/audit/audit.rules', '/etc/audit/rules.d', ['.rules']);
      const rules = parseRules(cfg.text);
      snapshot = {
        auditd,
        source: rules.length ? 'configured' : 'none',
        rules,
        immutable: rules.some((r) => /^-e\s+2$/.test(r)),
        files: cfg.files,
        errors: [
          ...cfg.errors,
          ...(loaded.error && needsRoot(loaded.output || loaded.error)
            ? ['auditctl: needs root']
            : []),
        ],
      };
      method = 'systemctl is-active auditd, /etc/audit rules files (configured, not loaded)';
    }
    const result = evaluateAuditPolicy(snapshot);
    const { covered, missing } = evaluateAuditRules(snapshot.rules);
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({
          auditd: snapshot.auditd,
          source: snapshot.source,
          ruleCount: snapshot.rules.length,
          immutable: snapshot.immutable,
          covered,
          missing,
          files: snapshot.files,
          errors: snapshot.errors,
        }).substring(0, 1800),
        message: result.message,
      },
      checkedAt,
    };
  }
}
