import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { asArray, errorMessage, parseJsonObject, runPowerShellScript } from './powershell';

/** Days since the last successful installation before the device is flagged. */
export const MAX_DAYS_SINCE_INSTALL = 30;

const SCRIPT = `
$r = @{}
try {
  $res = (New-Object -ComObject Microsoft.Update.AutoUpdate).Results
  $r.lastSearch = if ($res.LastSearchSuccessDate) { $res.LastSearchSuccessDate.ToUniversalTime().ToString('o') } else { $null }
  $r.lastInstall = if ($res.LastInstallationSuccessDate) { $res.LastInstallationSuccessDate.ToUniversalTime().ToString('o') } else { $null }
} catch { $r.autoUpdateError = $_.Exception.Message }
try {
  $s = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
  $s.Online = $false
  $q = $s.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
  $r.pendingCount = $q.Updates.Count
  $r.pending = @($q.Updates | ForEach-Object { @{ title = $_.Title; severity = [string]$_.MsrcSeverity; kb = (@($_.KBArticleIDs) -join ',') } })
} catch { $r.searchError = $_.Exception.Message }
$r.rebootPending = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
$r | ConvertTo-Json -Depth 4 -Compress
`;

export interface PendingUpdate {
  title?: string;
  severity?: string;
  kb?: string;
}

export interface WindowsUpdateSnapshot {
  lastSearch?: string | null;
  lastInstall?: string | null;
  autoUpdateError?: string | null;
  pendingCount?: number | null;
  pending?: PendingUpdate | PendingUpdate[] | null;
  searchError?: string | null;
  rebootPending?: boolean | null;
}

const daysSince = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
};

export function evaluateWindowsUpdate(
  s: WindowsUpdateSnapshot,
  now = Date.now(),
): {
  passed: boolean;
  daysSinceInstall: number | null;
  pendingTotal: number;
  pendingSecurity: PendingUpdate[];
  message: string;
} {
  const pending = asArray(s.pending);
  const pendingTotal = s.pendingCount ?? pending.length;
  const pendingSecurity = pending.filter((u) => /critical|important/i.test(u.severity ?? ''));
  const daysSinceInstall = daysSince(s.lastInstall, now);
  const problems: string[] = [];
  if (s.autoUpdateError && s.searchError) {
    return {
      passed: false,
      daysSinceInstall,
      pendingTotal,
      pendingSecurity,
      message: 'Windows Update status could not be read (Windows Update agent unavailable)',
    };
  }
  if (daysSinceInstall === null) problems.push('no successful update installation recorded');
  else if (daysSinceInstall > MAX_DAYS_SINCE_INSTALL)
    problems.push(`last successful installation ${daysSinceInstall} days ago`);
  if (pendingSecurity.length > 0)
    problems.push(
      `${pendingSecurity.length} critical/important update(s) pending: ${pendingSecurity
        .map((u) => (u.kb ? `KB${u.kb}` : (u.title ?? 'update')))
        .slice(0, 5)
        .join(', ')}`,
    );
  if (s.rebootPending) problems.push('a restart is pending to finish installing updates');

  const passed = problems.length === 0;
  return {
    passed,
    daysSinceInstall,
    pendingTotal,
    pendingSecurity,
    message: passed
      ? `Up to date: last installation ${daysSinceInstall} day(s) ago, ${pendingTotal} update(s) pending, none critical or important`
      : `Updates behind: ${problems.join('; ')}`,
  };
}

/**
 * NIST SP 800-171 3.14.1: flaws are corrected within the defined time frame.
 * Reads the Windows Update agent's last successful install, the cached list
 * of pending updates (offline search, no network) and the reboot-pending flag.
 */
export class WindowsUpdateCheck implements ComplianceCheck {
  checkType = 'windows_update' as const;
  displayName = 'Windows Update';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'Microsoft.Update.AutoUpdate results, offline update search';
    try {
      const output = runPowerShellScript(SCRIPT, 60000);
      const snapshot = parseJsonObject<WindowsUpdateSnapshot>(output);
      const result = evaluateWindowsUpdate(snapshot);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method,
          raw: JSON.stringify({
            lastSearch: snapshot.lastSearch ?? null,
            lastInstall: snapshot.lastInstall ?? null,
            pendingCount: result.pendingTotal,
            pendingSecurity: result.pendingSecurity.slice(0, 10),
            rebootPending: snapshot.rebootPending ?? null,
            errors: [snapshot.autoUpdateError, snapshot.searchError].filter(Boolean),
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
          message: 'Unable to read Windows Update status',
        },
        checkedAt,
      };
    }
  }
}
