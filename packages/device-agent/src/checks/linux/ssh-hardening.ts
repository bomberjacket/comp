import type { CheckResult } from '../../shared/types';
import { runCommandCapture } from '../shell';
import type { ComplianceCheck } from '../types';
import { fileExists, readConfigSet } from './files';
import { type UnitState, unitState } from './profile';

/** Idle timeout ceiling for an SSH session, in seconds (3.1.11 session termination). */
export const MAX_IDLE_SECONDS = 900;

export interface SshdSettings {
  permitRootLogin?: string;
  passwordAuthentication?: string;
  permitEmptyPasswords?: string;
  banner?: string;
  clientAliveInterval?: number;
  clientAliveCountMax?: number;
  maxAuthTries?: number;
  x11Forwarding?: string;
  protocol?: string;
}

const KEYS: Record<string, keyof SshdSettings> = {
  permitrootlogin: 'permitRootLogin',
  passwordauthentication: 'passwordAuthentication',
  permitemptypasswords: 'permitEmptyPasswords',
  banner: 'banner',
  clientaliveinterval: 'clientAliveInterval',
  clientalivecountmax: 'clientAliveCountMax',
  maxauthtries: 'maxAuthTries',
  x11forwarding: 'x11Forwarding',
  protocol: 'protocol',
};

/**
 * Parse `sshd -T` output or sshd_config text. sshd uses the FIRST value it
 * sees for a keyword, so earlier lines (and Include'd drop-ins listed before
 * the main body) win; `Match` blocks are skipped because they are conditional.
 */
export function parseSshdConfig(text: string): SshdSettings {
  const settings: SshdSettings = {};
  let inMatch = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [keyword, ...rest] = line.split(/[\s=]+/);
    const key = keyword.toLowerCase();
    if (key === 'match') {
      inMatch = true;
      continue;
    }
    if (inMatch) continue;
    const field = KEYS[key];
    if (!field || field in settings) continue;
    const value = rest.join(' ').trim();
    if (
      field === 'clientAliveInterval' ||
      field === 'clientAliveCountMax' ||
      field === 'maxAuthTries'
    ) {
      const n = Number(value);
      if (Number.isFinite(n)) settings[field] = n;
    } else {
      settings[field] = value;
    }
  }
  return settings;
}

export function evaluateSshd(
  s: SshdSettings,
  sshd: UnitState,
): { passed: boolean; problems: string[]; message: string } {
  const problems: string[] = [];
  const rootLogin = (s.permitRootLogin ?? 'prohibit-password').toLowerCase();
  if (rootLogin === 'yes') problems.push('PermitRootLogin yes (root can sign in over SSH)');
  if ((s.passwordAuthentication ?? 'yes').toLowerCase() === 'yes')
    problems.push('PasswordAuthentication yes (password-only remote access; keys or MFA expected)');
  if ((s.permitEmptyPasswords ?? 'no').toLowerCase() === 'yes')
    problems.push('PermitEmptyPasswords yes');
  const banner = (s.banner ?? 'none').toLowerCase();
  if (banner === 'none' || banner === '')
    problems.push('no Banner (system use notification, 3.1.9)');
  const interval = s.clientAliveInterval ?? 0;
  const count = s.clientAliveCountMax ?? 3;
  const idle = interval > 0 ? interval * Math.max(count, 1) : 0;
  if (idle === 0) problems.push('no idle timeout (ClientAliveInterval 0, 3.1.11)');
  else if (idle > MAX_IDLE_SECONDS)
    problems.push(`idle timeout ${idle}s exceeds ${MAX_IDLE_SECONDS}s (3.1.11)`);
  if ((s.protocol ?? '2').includes('1')) problems.push('SSH protocol 1 enabled');
  const passed = problems.length === 0;
  const notes: string[] = [];
  if (rootLogin === 'prohibit-password') notes.push('root allowed with keys only');
  if ((s.x11Forwarding ?? 'no').toLowerCase() === 'yes') notes.push('X11 forwarding on');
  const state = sshd === 'active' ? 'sshd running' : `sshd ${sshd}`;
  return {
    passed,
    problems,
    message: passed
      ? `SSH hardened: ${state}, root login ${rootLogin}, key-based authentication, banner set, idle timeout ${idle}s${notes.length ? ` (${notes.join(', ')})` : ''}`
      : `SSH not hardened: ${state}; ${problems.join('; ')}${notes.length ? ` (${notes.join(', ')})` : ''}`,
  };
}

/**
 * NIST SP 800-171 3.1.12 (monitor and control remote access), with 3.1.9
 * (system use notification) and 3.1.11 (session termination) riding along:
 * the OpenSSH server configuration. `sshd -T` gives the effective settings
 * but is root-only; otherwise sshd_config and its drop-ins are parsed with
 * sshd's first-value-wins rule.
 */
export class LinuxSshHardeningCheck implements ComplianceCheck {
  checkType = 'ssh_hardening' as const;
  displayName = 'SSH Hardening';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const sshd = unitState('ssh') === 'active' ? ('active' as UnitState) : unitState('sshd');
    if (!fileExists('/etc/ssh/sshd_config') && sshd === 'missing') {
      return {
        checkType: this.checkType,
        passed: true,
        details: {
          method: 'sshd_config presence, systemctl is-active sshd',
          raw: JSON.stringify({ sshd, configPresent: false }),
          message: 'OpenSSH server is not installed: no SSH remote access to harden',
          exception: 'Not applicable: OpenSSH server not installed',
        },
        checkedAt,
      };
    }
    const effective = runCommandCapture('sshd -T 2>/dev/null', 15000);
    let settings: SshdSettings;
    let method: string;
    let files: string[] = [];
    let errors: string[] = [];
    if (effective.exitCode === 0 && /permitrootlogin/i.test(effective.output)) {
      settings = parseSshdConfig(effective.output);
      method = 'sshd -T (effective configuration)';
    } else {
      // Include lines in sshd_config normally sit at the top, so drop-ins win: read them first.
      const dropIns = readConfigSet(null, '/etc/ssh/sshd_config.d', ['.conf']);
      const main = readConfigSet('/etc/ssh/sshd_config', null, []);
      settings = parseSshdConfig(`${dropIns.text}\n${main.text}`);
      files = [...dropIns.files, ...main.files];
      errors = [...dropIns.errors, ...main.errors];
      method = 'sshd_config and sshd_config.d (configured, first value wins)';
    }
    const result = evaluateSshd(settings, sshd);
    return {
      checkType: this.checkType,
      passed: result.passed && errors.length === 0,
      details: {
        method,
        raw: JSON.stringify({ sshd, settings, files, errors }).substring(0, 1800),
        message: errors.length
          ? `${result.message}; some configuration files were not readable`
          : result.message,
      },
      checkedAt,
    };
  }
}
