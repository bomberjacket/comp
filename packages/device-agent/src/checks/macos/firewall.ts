import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { errorMessage, runCommandCapture } from './shell';

const SOCKETFILTERFW = '/usr/libexec/ApplicationFirewall/socketfilterfw';

export interface FirewallSnapshot {
  /** 0 off, 1 on for specific services, 2 block all incoming. */
  globalState: number | null;
  stealthMode: boolean | null;
  blockAll: boolean | null;
}

/** "Firewall is enabled. (State = 1)" / "Firewall is disabled. (State = 0)" */
export function parseGlobalState(output: string): number | null {
  const m = /State\s*=\s*(\d)/i.exec(output);
  if (m) return Number(m[1]);
  if (/firewall is enabled/i.test(output)) return 1;
  if (/firewall is disabled/i.test(output)) return 0;
  return null;
}

/** "Stealth mode enabled" / "Firewall stealth mode is off" / "Block all DISABLED!" */
export function parseOnOff(output: string): boolean | null {
  if (/\b(enabled|on)\b/i.test(output) && !/\b(disabled|off)\b/i.test(output)) return true;
  if (/\b(disabled|off)\b/i.test(output)) return false;
  return null;
}

export function evaluateFirewall(s: FirewallSnapshot): { passed: boolean; message: string } {
  if (s.globalState === null) {
    return { passed: false, message: 'Unable to read the application firewall state' };
  }
  if (s.globalState === 0) {
    return { passed: false, message: 'The macOS application firewall is off' };
  }
  const extras: string[] = [];
  if (s.globalState === 2 || s.blockAll === true) extras.push('all incoming connections blocked');
  if (s.stealthMode === true) extras.push('stealth mode on');
  return {
    passed: true,
    message: `The macOS application firewall is on${extras.length ? ` (${extras.join(', ')})` : ''}`,
  };
}

/**
 * NIST SP 800-171 3.13.1: monitor, control and protect communications at the
 * boundary of the system, which for a laptop off the office network is the
 * host firewall. Reads the application firewall through socketfilterfw, the
 * supported interface on every macOS release including Sequoia, where the old
 * com.apple.alf preference file no longer holds the state.
 */
export class MacOSFirewallCheck implements ComplianceCheck {
  checkType = 'host_firewall' as const;
  displayName = 'Host Firewall';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'socketfilterfw --getglobalstate/--getstealthmode/--getblockall';
    try {
      const global = runCommandCapture(`${SOCKETFILTERFW} --getglobalstate`, 15000);
      const stealth = runCommandCapture(`${SOCKETFILTERFW} --getstealthmode`, 15000);
      const block = runCommandCapture(`${SOCKETFILTERFW} --getblockall`, 15000);
      const snapshot: FirewallSnapshot = {
        globalState: parseGlobalState(global.output),
        stealthMode: parseOnOff(stealth.output),
        blockAll: parseOnOff(block.output),
      };
      const result = evaluateFirewall(snapshot);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method,
          raw: JSON.stringify({
            ...snapshot,
            output: [global.output, stealth.output, block.output].filter(Boolean),
            errors: [global.error, stealth.error, block.error].filter(Boolean),
          }).substring(0, 1800),
          message: result.message,
        },
        checkedAt,
      };
    } catch (error) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method,
          raw: errorMessage(error).substring(0, 500),
          message: 'Unable to read the application firewall state',
        },
        checkedAt,
      };
    }
  }
}
