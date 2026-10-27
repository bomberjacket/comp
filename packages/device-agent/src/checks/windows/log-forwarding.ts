import { execSync } from 'node:child_process';
import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';

/** Windows service names of log forwarders a DIB endpoint commonly runs, and their display names. */
export const FORWARDER_SERVICES: Record<string, string> = {
  AzureMonitorAgent: 'Azure Monitor Agent',
  HealthService: 'Log Analytics agent (MMA)',
  SplunkForwarder: 'Splunk Universal Forwarder',
  nxlog: 'NXLog',
  winlogbeat: 'Elastic Winlogbeat',
  'Elastic Agent': 'Elastic Agent',
  WazuhSvc: 'Wazuh agent',
  DatadogAgent: 'Datadog Agent',
  'Sumo Logic Collector': 'Sumo Logic collector',
  'Blumira Agent': 'Blumira agent',
};

const WEF_KEY =
  'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\EventLog\\EventForwarding\\SubscriptionManager';

/**
 * One PowerShell run collects the forwarder services and the Windows Event
 * Forwarding subscription manager policy. Sent as -EncodedCommand so quoting
 * survives cmd.exe untouched.
 */
const SCRIPT = `
$names = @(${Object.keys(FORWARDER_SERVICES)
  .map((n) => `'${n}'`)
  .join(',')})
$svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.Name } | Select-Object Name, DisplayName, @{ n = 'Status'; e = { $_.Status.ToString() } }
$wef = Get-Item -Path '${WEF_KEY}' -ErrorAction SilentlyContinue
$targets = @()
if ($wef) { foreach ($v in $wef.GetValueNames()) { $targets += [string]$wef.GetValue($v) } }
@{ services = @($svc); wef = $targets } | ConvertTo-Json -Depth 3 -Compress
`;

export interface ForwarderService {
  Name?: string;
  DisplayName?: string;
  Status?: string | number;
}

export interface LogForwardingSnapshot {
  services?: ForwarderService | ForwarderService[] | null;
  wef?: string | string[] | null;
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Service status as PowerShell reports it: 'Running' or the enum value 4. */
function isRunning(status: string | number | undefined): boolean {
  return status === 'Running' || status === 4 || status === '4';
}

/**
 * Decide from the snapshot which forwarders are running. Pure, so it is
 * tested without PowerShell.
 */
export function evaluateLogForwarding(snapshot: LogForwardingSnapshot): {
  passed: boolean;
  running: string[];
  installedNotRunning: string[];
  wefTargets: string[];
  message: string;
} {
  const services = asArray(snapshot.services).filter((s) => s && s.Name);
  const running = services
    .filter((s) => isRunning(s.Status))
    .map((s) => FORWARDER_SERVICES[s.Name!] ?? s.DisplayName ?? s.Name!);
  const installedNotRunning = services
    .filter((s) => !isRunning(s.Status))
    .map((s) => FORWARDER_SERVICES[s.Name!] ?? s.DisplayName ?? s.Name!);
  const wefTargets = asArray(snapshot.wef).filter((t) => typeof t === 'string' && t.length > 0);

  const passed = running.length > 0 || wefTargets.length > 0;
  const parts: string[] = [];
  if (running.length) parts.push(`running: ${running.join(', ')}`);
  if (wefTargets.length)
    parts.push(`Windows Event Forwarding to ${wefTargets.length} collector(s)`);
  if (installedNotRunning.length)
    parts.push(`installed but stopped: ${installedNotRunning.join(', ')}`);

  return {
    passed,
    running,
    installedNotRunning,
    wefTargets,
    message: passed
      ? `Log forwarding active (${parts.join('; ')})`
      : installedNotRunning.length
        ? `No log forwarder running (${parts.join('; ')})`
        : 'No log forwarding agent or Windows Event Forwarding policy found',
  };
}

/**
 * NIST SP 800-171 3.3.1: audit records are created and retained. The SIEM
 * checks prove the workspace exists and keeps logs; this check proves the
 * device actually ships its events there. Evidence only: a failure does not
 * change the device's compliance verdict.
 */
export class WindowsLogForwardingCheck implements ComplianceCheck {
  checkType = 'log_forwarding' as const;
  displayName = 'Log Forwarding';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    try {
      const output = execSync(
        `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
        { encoding: 'utf-8', timeout: 20000 },
      ).trim();
      const snapshot = (output ? JSON.parse(output) : {}) as LogForwardingSnapshot;
      const result = evaluateLogForwarding(snapshot);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method: 'Get-Service + EventForwarding policy',
          raw: output.substring(0, 1000),
          message: result.message,
        },
        checkedAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method: 'Get-Service + EventForwarding policy',
          raw: errorMessage.substring(0, 500),
          message: 'Unable to determine log forwarding status',
        },
        checkedAt,
      };
    }
  }
}
