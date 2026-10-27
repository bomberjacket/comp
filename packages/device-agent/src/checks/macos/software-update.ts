import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { defaultsBool, parseDefaultsDomain, runCommandCapture } from './shell';

/** Days since the last successful update check before the device is flagged. */
export const MAX_DAYS_SINCE_CHECK = 7;

const SYSTEM_PREFS = '/Library/Preferences/com.apple.SoftwareUpdate';
const MANAGED_PREFS = '/Library/Managed Preferences/com.apple.SoftwareUpdate';

export interface PendingMacUpdate {
  label: string;
  title?: string;
  version?: string;
  recommended?: boolean;
  action?: string;
}

export interface SoftwareUpdateSnapshot {
  pending: PendingMacUpdate[];
  listError: string | null;
  /** Effective preferences: the system domain overlaid by any managed profile. */
  prefs: Record<string, string>;
}

/**
 * Parse `softwareupdate --list --no-scan`:
 *   * Label: macOS Sonoma 14.6.1-23G93
 *   	Title: macOS Sonoma 14.6.1, Version: 14.6.1, Size: 1234KiB, Recommended: YES, Action: restart,
 */
export function parseSoftwareUpdateList(output: string): PendingMacUpdate[] {
  const updates: PendingMacUpdate[] = [];
  let current: PendingMacUpdate | null = null;
  for (const line of output.split(/\r?\n/)) {
    const label = /^\s*\*\s*Label:\s*(.+?)\s*$/.exec(line);
    if (label) {
      current = { label: label[1] };
      updates.push(current);
      continue;
    }
    if (!current) continue;
    for (const pair of line.split(/,\s*/)) {
      const kv = /^\s*([A-Za-z ]+):\s*(.+?)\s*$/.exec(pair);
      if (!kv) continue;
      const key = kv[1].trim().toLowerCase();
      if (key === 'title') current.title = kv[2];
      else if (key === 'version') current.version = kv[2];
      else if (key === 'recommended') current.recommended = /^yes$/i.test(kv[2]);
      else if (key === 'action') current.action = kv[2];
    }
  }
  return updates;
}

/** `defaults` prints dates as "2026-10-25 02:11:40 +0000". */
export function parseDefaultsDate(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(v.trim());
  const t = Date.parse(m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : v);
  return Number.isNaN(t) ? null : t;
}

export function evaluateSoftwareUpdate(
  s: SoftwareUpdateSnapshot,
  now = Date.now(),
): {
  passed: boolean;
  daysSinceCheck: number | null;
  recommended: PendingMacUpdate[];
  message: string;
} {
  const recommended = s.pending.filter((u) => u.recommended !== false);
  const lastCheck = parseDefaultsDate(s.prefs.LastSuccessfulDate ?? s.prefs.LastFullSuccessfulDate);
  const daysSinceCheck = lastCheck === null ? null : Math.floor((now - lastCheck) / 86_400_000);
  const autoCheck = defaultsBool(s.prefs.AutomaticCheckEnabled);
  const criticalInstall = defaultsBool(s.prefs.CriticalUpdateInstall);

  if (s.listError && Object.keys(s.prefs).length === 0) {
    return {
      passed: false,
      daysSinceCheck,
      recommended,
      message:
        'Software Update status could not be read (softwareupdate and preferences unavailable)',
    };
  }

  const problems: string[] = [];
  if (recommended.length > 0)
    problems.push(
      `${recommended.length} recommended update(s) pending: ${recommended
        .map((u) => u.title ?? u.label)
        .slice(0, 5)
        .join(', ')}`,
    );
  if (daysSinceCheck === null) problems.push('no successful update check recorded');
  else if (daysSinceCheck > MAX_DAYS_SINCE_CHECK)
    problems.push(`last successful update check ${daysSinceCheck} days ago`);
  if (autoCheck === false) problems.push('automatic update checks are off');
  if (criticalInstall === false)
    problems.push('security responses and system files are not installed automatically');

  const passed = problems.length === 0;
  return {
    passed,
    daysSinceCheck,
    recommended,
    message: passed
      ? `Up to date: last check ${daysSinceCheck} day(s) ago, ${s.pending.length} update(s) pending, none recommended${
          autoCheck === null ? ' (automatic check setting not readable)' : ''
        }`
      : `Updates behind: ${problems.join('; ')}`,
  };
}

/**
 * NIST SP 800-171 3.14.1: flaws are corrected within the defined time frame.
 * Reads the cached list of pending updates (no network scan), the last
 * successful check date and the automatic-update preferences, including any
 * values an MDM profile manages.
 */
export class MacOSSoftwareUpdateCheck implements ComplianceCheck {
  checkType = 'software_update' as const;
  displayName = 'Software Update';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'softwareupdate --list --no-scan, com.apple.SoftwareUpdate preferences';
    const list = runCommandCapture('softwareupdate --list --no-scan', 60000);
    const system = runCommandCapture(`defaults read ${SYSTEM_PREFS}`, 15000);
    const managed = runCommandCapture(`defaults read "${MANAGED_PREFS}"`, 15000);
    const snapshot: SoftwareUpdateSnapshot = {
      pending: parseSoftwareUpdateList(list.output),
      listError: list.exitCode === 0 || /no new software/i.test(list.output) ? null : list.error,
      prefs: { ...parseDefaultsDomain(system.output), ...parseDefaultsDomain(managed.output) },
    };
    const result = evaluateSoftwareUpdate(snapshot);
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({
          lastCheck: snapshot.prefs.LastSuccessfulDate ?? null,
          automaticCheck: snapshot.prefs.AutomaticCheckEnabled ?? null,
          automaticDownload: snapshot.prefs.AutomaticDownload ?? null,
          installMacOSUpdates: snapshot.prefs.AutomaticallyInstallMacOSUpdates ?? null,
          criticalUpdateInstall: snapshot.prefs.CriticalUpdateInstall ?? null,
          managedByProfile: managed.exitCode === 0,
          pending: snapshot.pending.slice(0, 10),
          errors: [snapshot.listError, system.error].filter(Boolean),
        }).substring(0, 1800),
        message: result.message,
      },
      checkedAt,
    };
  }
}
