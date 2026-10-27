import type { CheckResult } from '../../shared/types';
import { runCommandCapture } from '../shell';
import type { ComplianceCheck } from '../types';
import { type UnitState, unitState } from './profile';

/** Host firewall front ends and the systemd unit each one runs as. */
export const FIREWALL_UNITS: Record<string, string> = {
  firewalld: 'firewalld',
  ufw: 'ufw',
  nftables: 'nftables',
  iptables: 'iptables',
  'netfilter-persistent': 'netfilter-persistent',
};

export interface FirewallSnapshot {
  units: Record<string, UnitState>;
  /** `firewall-cmd --state` prints "running" or "not running". */
  firewalldState: string | null;
  /** `ufw status` prints "Status: active" / "Status: inactive"; root only on most distros. */
  ufwStatus: string | null;
  /** Rule count from `nft list ruleset`, root only; null when not readable. */
  nftRules: number | null;
}

export function evaluateFirewall(s: FirewallSnapshot): {
  passed: boolean;
  active: string[];
  message: string;
} {
  const active = Object.entries(s.units)
    .filter(([, state]) => state === 'active')
    .map(([name]) => name);
  if (/^running/i.test(s.firewalldState ?? '') && !active.includes('firewalld'))
    active.push('firewalld');
  if (/Status:\s*active/i.test(s.ufwStatus ?? '') && !active.includes('ufw')) active.push('ufw');

  if (active.length > 0) {
    const detail = s.nftRules !== null ? `, ${s.nftRules} nftables rule(s) loaded` : '';
    return { passed: true, active, message: `Host firewall active: ${active.join(', ')}${detail}` };
  }
  const installed = Object.entries(s.units)
    .filter(([, state]) => state === 'inactive' || state === 'failed')
    .map(([name, state]) => `${name} (${state})`);
  if (installed.length > 0) {
    return {
      passed: false,
      active,
      message: `Host firewall installed but not running: ${installed.join(', ')}`,
    };
  }
  if (Object.values(s.units).every((state) => state === 'unknown')) {
    return {
      passed: false,
      active,
      message: 'Unable to read firewall service state (systemctl unavailable)',
    };
  }
  return {
    passed: false,
    active,
    message: 'No host firewall found (firewalld, ufw, nftables or iptables service)',
  };
}

/**
 * NIST SP 800-171 3.13.1: communications at the system boundary are
 * controlled; for a server that is the host firewall in front of the
 * network-facing services. Service state comes from systemd (any user);
 * firewall-cmd and ufw add detail where they answer unprivileged.
 */
export class LinuxFirewallCheck implements ComplianceCheck {
  checkType = 'host_firewall' as const;
  displayName = 'Host Firewall';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'systemctl is-active firewalld/ufw/nftables/iptables, firewall-cmd --state';
    const units: Record<string, UnitState> = {};
    for (const [name, unit] of Object.entries(FIREWALL_UNITS)) units[name] = unitState(unit);
    const fwcmd = runCommandCapture('firewall-cmd --state 2>/dev/null', 10000).output;
    const ufw = runCommandCapture('ufw status 2>/dev/null', 10000).output;
    const nft = runCommandCapture('nft list ruleset 2>/dev/null', 10000);
    const nftRules =
      nft.exitCode === 0 && nft.output
        ? nft.output
            .split(/\r?\n/)
            .filter((l) =>
              /^\s+(ip|ip6|tcp|udp|ct|iif|oif|meta|accept|drop|reject|jump|counter)/.test(l),
            ).length
        : null;
    const snapshot: FirewallSnapshot = {
      units,
      firewalldState: fwcmd || null,
      ufwStatus: ufw || null,
      nftRules,
    };
    const result = evaluateFirewall(snapshot);
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({
          ...snapshot,
          ufwStatus: snapshot.ufwStatus?.split(/\r?\n/)[0] ?? null,
        }),
        message: result.message,
      },
      checkedAt,
    };
  }
}
