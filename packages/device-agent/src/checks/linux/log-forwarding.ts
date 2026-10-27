import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { readConfigSet, readText } from './files';
import { type UnitState, unitState } from './profile';

/** systemd units of log shippers a DIB server commonly runs, and their display names. */
export const FORWARDER_UNITS: Record<string, string> = {
  azuremonitoragent: 'Azure Monitor Agent',
  omsagent: 'Log Analytics agent (OMS)',
  SplunkForwarder: 'Splunk Universal Forwarder',
  splunk: 'Splunk',
  filebeat: 'Elastic Filebeat',
  'elastic-agent': 'Elastic Agent',
  'fluent-bit': 'Fluent Bit',
  fluentd: 'Fluentd',
  'td-agent': 'Fluentd (td-agent)',
  nxlog: 'NXLog',
  'wazuh-agent': 'Wazuh agent',
  'datadog-agent': 'Datadog Agent',
  collector: 'Sumo Logic collector',
  'systemd-journal-upload': 'systemd journal upload',
};

export interface LogForwardingSnapshot {
  units: Record<string, UnitState>;
  /** Remote destinations found in rsyslog or syslog-ng configuration. */
  syslogTargets: string[];
  /** Whether the syslog daemon that owns those targets is running. */
  syslogDaemon: UnitState;
  /** URL from /etc/systemd/journal-upload.conf. */
  journalUploadUrl: string | null;
}

/**
 * rsyslog: `*.* @@siem.example.com:514`, `action(type="omfwd" target="siem" port="6514")`.
 * syslog-ng: `destination d_siem { network("siem" port(514)); tcp("siem" ...); syslog("siem" ...); };`
 */
export function parseSyslogTargets(text: string): string[] {
  const targets = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const legacy = /@{1,2}(?:\([^)]*\))?\[?([A-Za-z0-9_.:-]+)\]?(?::(\d+))?/.exec(line);
    if (legacy && /^\S+\s+@/.test(line))
      targets.add(legacy[2] ? `${legacy[1]}:${legacy[2]}` : legacy[1]);
    const omfwd = /target\s*=\s*"([^"]+)"(?:.*?port\s*=\s*"(\d+)")?/i.exec(line);
    if (omfwd) targets.add(omfwd[2] ? `${omfwd[1]}:${omfwd[2]}` : omfwd[1]);
    const ng =
      /\b(?:network|tcp|udp|syslog|tcp6|udp6)\s*\(\s*"([^"]+)"(?:.*?port\s*\(\s*(\d+)\s*\))?/i.exec(
        line,
      );
    if (ng) targets.add(ng[2] ? `${ng[1]}:${ng[2]}` : ng[1]);
  }
  return [...targets].filter((t) => !/^(127\.|localhost|::1)/.test(t));
}

export function parseJournalUploadUrl(text: string | null): string | null {
  if (!text) return null;
  const m = /^\s*URL\s*=\s*(\S+)/m.exec(text);
  return m ? m[1] : null;
}

export function evaluateLogForwarding(s: LogForwardingSnapshot): {
  passed: boolean;
  running: string[];
  message: string;
} {
  const running = Object.entries(s.units)
    .filter(([, state]) => state === 'active')
    .map(([unit]) => FORWARDER_UNITS[unit] ?? unit);
  const syslogOk = s.syslogTargets.length > 0 && s.syslogDaemon === 'active';
  const journalOk = s.journalUploadUrl !== null && s.units['systemd-journal-upload'] === 'active';
  const parts: string[] = [];
  if (running.length) parts.push(`${running.join(', ')} running`);
  if (syslogOk) parts.push(`syslog forwards to ${s.syslogTargets.join(', ')}`);
  if (journalOk && !running.includes('systemd journal upload'))
    parts.push(`journal uploads to ${s.journalUploadUrl}`);
  if (parts.length) {
    return { passed: true, running, message: `Logs are forwarded: ${parts.join('; ')}` };
  }
  const problems: string[] = [];
  const stopped = Object.entries(s.units)
    .filter(([, state]) => state === 'inactive' || state === 'failed')
    .map(([unit, state]) => `${FORWARDER_UNITS[unit] ?? unit} (${state})`);
  if (stopped.length) problems.push(`forwarder installed but not running: ${stopped.join(', ')}`);
  if (s.syslogTargets.length && s.syslogDaemon !== 'active')
    problems.push(
      `syslog remote target configured (${s.syslogTargets.join(', ')}) but the syslog daemon is ${s.syslogDaemon}`,
    );
  if (s.journalUploadUrl && s.units['systemd-journal-upload'] !== 'active')
    problems.push('journal-upload URL configured but systemd-journal-upload is not running');
  return {
    passed: false,
    running,
    message: problems.length
      ? `Logs are not forwarded: ${problems.join('; ')}`
      : 'No log forwarding found: no SIEM agent running, no remote syslog target, no journal upload',
  };
}

/**
 * NIST SP 800-171 3.3.1 (and 3.3.8, protecting audit information): this
 * host's logs reach a central collector. Checks the common SIEM agents as
 * systemd units, remote targets in rsyslog and syslog-ng configuration, and
 * systemd journal upload. All readable by any user on the usual distributions.
 */
export class LinuxLogForwardingCheck implements ComplianceCheck {
  checkType = 'log_forwarding' as const;
  displayName = 'Log Forwarding';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method =
      'systemctl is-active SIEM agents, rsyslog/syslog-ng remote targets, journal-upload';
    const units: Record<string, UnitState> = {};
    for (const unit of Object.keys(FORWARDER_UNITS)) units[unit] = unitState(unit);
    const rsyslog = readConfigSet('/etc/rsyslog.conf', '/etc/rsyslog.d', ['.conf']);
    const syslogNg = readConfigSet('/etc/syslog-ng/syslog-ng.conf', '/etc/syslog-ng/conf.d', [
      '.conf',
    ]);
    const syslogTargets = [
      ...new Set([...parseSyslogTargets(rsyslog.text), ...parseSyslogTargets(syslogNg.text)]),
    ];
    const rsyslogState = unitState('rsyslog');
    const syslogDaemon: UnitState = rsyslogState === 'active' ? 'active' : unitState('syslog-ng');
    const journal = readText('/etc/systemd/journal-upload.conf');
    const snapshot: LogForwardingSnapshot = {
      units,
      syslogTargets,
      syslogDaemon,
      journalUploadUrl: parseJournalUploadUrl(journal.text),
    };
    const result = evaluateLogForwarding(snapshot);
    const unknown = Object.values(units).every((u) => u === 'unknown');
    return {
      checkType: this.checkType,
      passed: result.passed,
      details: {
        method,
        raw: JSON.stringify({
          running: result.running,
          units: Object.fromEntries(Object.entries(units).filter(([, s]) => s !== 'missing')),
          syslogTargets,
          syslogDaemon,
          journalUploadUrl: snapshot.journalUploadUrl,
          configFiles: [...rsyslog.files, ...syslogNg.files],
          errors: [
            ...rsyslog.errors,
            ...syslogNg.errors,
            ...(journal.error ? [journal.error] : []),
          ],
        }).substring(0, 1800),
        message: unknown
          ? `${result.message} (systemctl unavailable; service states unknown)`
          : result.message,
      },
      checkedAt,
    };
  }
}
