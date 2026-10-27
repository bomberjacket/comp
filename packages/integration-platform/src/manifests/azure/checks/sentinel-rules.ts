import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import {
  SENTINEL_API,
  loadSentinelWorkspaces,
  unverified,
  workspaceEvidence,
  workspaceUrl,
} from './sentinel-shared';
import { armListAll } from './shared';

interface AlertRule {
  id: string;
  name: string;
  kind: string;
  properties?: {
    displayName?: string;
    enabled?: boolean;
    severity?: string;
    tactics?: string[];
    lastModifiedUtc?: string;
    alertRuleTemplateName?: string | null;
  };
}

const NAME_SAMPLE = 50;

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

async function runAnalyticsRules(ctx: CheckContext): Promise<void> {
  const workspaces = await loadSentinelWorkspaces(ctx);
  if (!workspaces) return;

  for (const w of workspaces) {
    const ws = w.workspace;
    let rules: AlertRule[];
    try {
      rules = await armListAll<AlertRule>(
        ctx,
        workspaceUrl(ws, 'providers/Microsoft.SecurityInsights/alertRules', SENTINEL_API),
      );
    } catch (err) {
      unverified(ctx, `Sentinel analytics rules in ${ws.name}`, ws.name, err);
      continue;
    }
    const enabled = rules.filter((r) => r.properties?.enabled === true);
    ctx.log(`${ws.name}: ${enabled.length} of ${rules.length} analytics rules enabled`);

    const evidence = {
      ...workspaceEvidence(w),
      rulesTotal: rules.length,
      rulesEnabled: enabled.length,
      enabledBySeverity: countBy(enabled, (r) => r.properties?.severity ?? 'Unspecified'),
      enabledByKind: countBy(enabled, (r) => r.kind),
      enabledRuleNames: enabled
        .map((r) => r.properties?.displayName ?? r.name)
        .sort()
        .slice(0, NAME_SAMPLE),
      tactics: [...new Set(enabled.flatMap((r) => r.properties?.tactics ?? []))].sort(),
    };

    if (enabled.length === 0) {
      ctx.fail({
        title: `No enabled analytics rules: ${ws.name}`,
        description: `Sentinel in ${ws.name} has ${rules.length} analytics rule(s) and none is enabled, so nothing turns the collected logs into alerts.`,
        resourceType: 'log-analytics-workspace',
        resourceId: ws.name,
        severity: 'high',
        remediation:
          'Enable analytics rules from the Sentinel content hub for the connected sources (Entra ID, Office 365, Defender), including the Microsoft incident creation rules and Fusion.',
        evidence,
      });
      continue;
    }

    ctx.pass({
      title: `${enabled.length} analytics rules enabled: ${ws.name}`,
      description: `Sentinel in ${ws.name} runs ${enabled.length} enabled analytics rules (${Object.entries(
        evidence.enabledBySeverity,
      )
        .map(([s, n]) => `${n} ${s}`)
        .join(', ')}) across ${evidence.tactics.length} ATT&CK tactics.`,
      resourceType: 'log-analytics-workspace',
      resourceId: ws.name,
      evidence,
    });

    const fusion = rules.find((r) => r.kind === 'Fusion');
    if (fusion && fusion.properties?.enabled !== true) {
      ctx.fail({
        title: `Fusion multi-stage attack detection disabled: ${ws.name}`,
        description: `The Fusion rule in ${ws.name} is disabled; it is on by default and correlates low-fidelity alerts across sources into incidents.`,
        resourceType: 'sentinel-alert-rule',
        resourceId: `${ws.name}/Fusion`,
        severity: 'low',
        remediation:
          'Enable the "Advanced Multistage Attack Detection" rule under Analytics, or document why it is off.',
        evidence: { ...workspaceEvidence(w), ruleId: fusion.name },
      });
    }
  }
}

/** 3.14.6[a] The system is monitored to detect attacks and indicators of potential attacks. */
export const sentinelAnalyticsRulesCheck: IntegrationCheck = {
  id: 'sentinel-analytics-rules',
  name: 'Sentinel analytics rules (3.14.6)',
  description:
    'Counts the enabled analytics rules in each Sentinel workspace by severity, kind and ATT&CK tactic, and flags a disabled Fusion rule. Evidence for 3.14.6[a].',
  service: 'sentinel',
  taskMapping: TASK_TEMPLATES['3.14.6[a]'],
  defaultSeverity: 'high',
  run: runAnalyticsRules,
};

/** 3.6.1[c] The operational incident-handling capability includes detection. */
export const sentinelDetectionCapabilityCheck: IntegrationCheck = {
  id: 'sentinel-detection-capability',
  name: 'Incident detection capability (3.6.1)',
  description:
    'Same analytics-rule evidence, filed against 3.6.1[c]: enabled Sentinel rules are the automated detection half of the incident-handling capability.',
  service: 'sentinel',
  taskMapping: TASK_TEMPLATES['3.6.1[c]'],
  defaultSeverity: 'high',
  run: runAnalyticsRules,
};
