import { TASK_TEMPLATES } from '../../task-mappings';
import type { CheckContext, FindingSeverity, IntegrationCheck } from '../../types';
import { SCUBA_OBJECTIVES } from './objective-map';
import { SCUBA_BASELINE_VERSION, SCUBA_POLICIES } from './policies.generated';
import { findPolicy, readStoredResults, reportAgeDays } from './results';
import type { ScubaCompactPolicy, ScubaCompactResults, ScubaPolicyDef } from './types';
import { SCUBA_PRODUCTS } from './types';
import { maxReportAgeDaysVariable, parseScubaGearOptions, shouldPoliciesVariable } from './variables';

export const REPORT_CHECK_ID = 'scubagear-report';

/** `MS.AAD.1.1` -> `scuba-ms-aad-1-1` */
export function checkIdFor(base: string): string {
  return `scuba-${base.toLowerCase().replace(/\./g, '-')}`;
}

function reportEvidence(results: ScubaCompactResults, ageDays: number) {
  const { meta } = results;
  return {
    reportId: meta.reportId,
    reportTimestamp: meta.timestamp,
    reportAgeDays: Number.isFinite(ageDays) ? ageDays : null,
    tenantId: meta.tenantId,
    tenantDisplayName: meta.displayName,
    domainName: meta.domainName,
    toolVersion: meta.toolVersion,
  };
}

function policyEvidence(def: ScubaPolicyDef, p: ScubaCompactPolicy, results: ScubaCompactResults, ageDays: number) {
  return {
    policyId: p.id,
    product: SCUBA_PRODUCTS[def.product].name,
    group: `${p.groupNumber}. ${p.groupName}`,
    requirement: p.requirement,
    result: p.result,
    criticality: p.criticality,
    bod2501: p.bod2501,
    details: p.details,
    comments: p.comments,
    ...(p.omitted ? { omitted: p.omitted } : {}),
    ...(p.incorrect ? { incorrectResultAnnotation: p.incorrect } : {}),
    nist80053: def.nist80053,
    nist800171Objective: SCUBA_OBJECTIVES[def.base] ?? null,
    baselineReference: def.reference,
    ...reportEvidence(results, ageDays),
  };
}

/** Load results and refuse stale ones; shared by every check. */
function loadFresh(ctx: CheckContext, resourceId: string): { results: ScubaCompactResults; ageDays: number } | null {
  const results = readStoredResults(ctx);
  if (!results) return null;
  const { maxReportAgeDays } = parseScubaGearOptions(ctx.variables);
  const ageDays = reportAgeDays(results);
  if (ageDays > maxReportAgeDays) {
    ctx.fail({
      title: `ScubaGear report is stale (${Number.isFinite(ageDays) ? `${ageDays} days` : 'no timestamp'})`,
      description: `The uploaded ScubaGear report is older than the ${maxReportAgeDays}-day limit, so it no longer counts as evidence.`,
      resourceType: 'report',
      resourceId,
      severity: 'medium',
      remediation: 'Run Invoke-SCuBA against the tenant again and upload the new ScubaResults JSON from the connection settings.',
      evidence: reportEvidence(results, ageDays),
    });
    return null;
  }
  return { results, ageDays };
}

function shallSeverity(def: ScubaPolicyDef): FindingSeverity {
  return def.criticality === 'Shall' ? 'high' : 'medium';
}

function remediationFor(def: ScubaPolicyDef, p: ScubaCompactPolicy): string {
  const where = def.reference ? ` Baseline guidance: ${def.reference}` : '';
  return `${p.details || 'See the ScubaGear report for details.'}${where}`;
}

function runPolicy(ctx: CheckContext, def: ScubaPolicyDef): void {
  const loaded = loadFresh(ctx, def.id);
  if (!loaded) return;
  const { results, ageDays } = loaded;
  const p = findPolicy(results, def.id);
  if (!p) {
    ctx.log(`${def.id}: not in the report (product not assessed or policy not in this ScubaGear version)`);
    return;
  }
  const { warningsAsFindings } = parseScubaGearOptions(ctx.variables);
  const evidence = policyEvidence(def, p, results, ageDays);
  const base = { resourceType: 'policy', resourceId: p.id, evidence };
  const label = `${p.id} ${p.requirement}`;

  switch (p.result) {
    case 'Pass':
      ctx.pass({ ...base, title: `Pass: ${label}`, description: p.details || 'ScubaGear evaluated the policy as Pass.' });
      return;
    case 'Fail':
      ctx.fail({
        ...base,
        title: `Fail: ${label}`,
        description: `ScubaGear evaluated this ${p.criticality.toUpperCase()} policy as Fail. ${p.details}`.trim(),
        severity: shallSeverity(def),
        remediation: remediationFor(def, p),
      });
      return;
    case 'Warning':
      if (warningsAsFindings) {
        ctx.fail({
          ...base,
          title: `Warning: ${label}`,
          description: `ScubaGear reports this SHOULD policy as not met. ${p.details}`.trim(),
          severity: 'low',
          remediation: remediationFor(def, p),
        });
      } else {
        ctx.pass({
          ...base,
          title: `Recommendation not met (informational): ${label}`,
          description: `ScubaGear reports this SHOULD policy as not met. Recorded for information; the connection is set not to fail evidence tasks on SHOULD policies. ${p.details}`.trim(),
        });
      }
      return;
    case 'Error':
      ctx.fail({
        ...base,
        title: `Could not evaluate: ${label}`,
        description: `ScubaGear hit an error while evaluating this policy, so it is unverified. ${p.details}`.trim(),
        severity: 'medium',
        remediation: 'Check the ScubaGear debug log for the product, fix the permission or connectivity problem, and run it again.',
      });
      return;
    case 'Omitted':
      ctx.log(`${p.id}: omitted in the ScubaGear configuration (${p.omitted?.details ?? 'no rationale recorded'})`);
      return;
    default:
      ctx.log(`${p.id}: ${p.result} (manual policy; ScubaGear has no automated check)`);
  }
}

function describe(def: ScubaPolicyDef): string {
  const objective = SCUBA_OBJECTIVES[def.base];
  const mapping = objective
    ? `Evidence for NIST SP 800-171 ${objective}.`
    : 'Evidence only; no NIST SP 800-171 Rev 2 objective maps to this policy.';
  const nist53 = def.nist80053.length ? ` CISA maps it to 800-53 ${def.nist80053.join(', ')}.` : '';
  const manual = def.automated ? '' : ' ScubaGear cannot check this policy automatically; it is reported as N/A.';
  return `${def.id} (${def.criticality.toUpperCase()}${def.bod2501 ? ', BOD 25-01' : ''}): ${def.requirement} ${mapping}${nist53}${manual}`;
}

function trim(text: string, max = 110): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** One check per SCuBA policy; the id is stable across policy version bumps. */
export function buildPolicyChecks(): IntegrationCheck[] {
  return SCUBA_POLICIES.map((def) => {
    const objective = SCUBA_OBJECTIVES[def.base];
    if (objective && !TASK_TEMPLATES[objective]) throw new Error(`No task template for objective ${objective}`);
    return {
      id: checkIdFor(def.base),
      name: `${def.base} ${trim(def.requirement)}`,
      description: describe(def),
      service: SCUBA_PRODUCTS[def.product].service,
      taskMapping: objective ? TASK_TEMPLATES[objective] : undefined,
      defaultSeverity: shallSeverity(def),
      variables: [shouldPoliciesVariable, maxReportAgeDaysVariable],
      run: async (ctx) => runPolicy(ctx, def),
    };
  });
}

/** Report-level check: the upload exists, is fresh, and which products it covers. */
export const scubaReportCheck: IntegrationCheck = {
  id: REPORT_CHECK_ID,
  name: 'ScubaGear report uploaded and current',
  description: `Confirms a ScubaGear results file is on the connection, is newer than the configured maximum age, and records the tenant, tool version and per-product summary. Baselines expected: ScubaGear ${SCUBA_BASELINE_VERSION}.`,
  service: 'report',
  defaultSeverity: 'medium',
  variables: [maxReportAgeDaysVariable],
  run: async (ctx) => {
    const results = readStoredResults(ctx);
    if (!results) {
      ctx.fail({
        title: 'No ScubaGear results uploaded',
        description: 'This connection has no ScubaGear report yet, so no SCuBA policy evidence exists.',
        resourceType: 'report',
        resourceId: 'report',
        severity: 'low',
        remediation: 'Run Invoke-SCuBA on a Windows host against the tenant and upload the ScubaResults JSON from the connection settings.',
      });
      return;
    }
    const loaded = loadFresh(ctx, 'report');
    if (!loaded) return;
    const known = new Set(SCUBA_POLICIES.map((d) => d.id));
    const unknownPolicies = results.policies.filter((p) => !known.has(p.id)).map((p) => p.id);
    ctx.pass({
      title: `ScubaGear ${results.meta.toolVersion} report for ${results.meta.domainName || results.meta.tenantId}`,
      description: `Report ${results.meta.reportId} from ${results.meta.timestamp} covers ${results.meta.productsAssessed.join(', ')} (${results.policies.length} policies).`,
      resourceType: 'report',
      resourceId: 'report',
      evidence: {
        ...reportEvidence(results, loaded.ageDays),
        productsAssessed: results.meta.productsAssessed,
        summary: results.summary,
        policyCount: results.policies.length,
        unknownPolicies,
        baselineVersionExpected: SCUBA_BASELINE_VERSION,
      },
    });
    if (unknownPolicies.length) {
      ctx.warn(`${unknownPolicies.length} policies in the report have no check in this build`, { unknownPolicies });
    }
  },
};
