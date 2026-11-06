import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CheckContext, CheckFindingResult, CheckPassingResult, CheckVariableValues } from '../../../types';
import { scubaGearManifest } from '..';
import { buildPolicyChecks, checkIdFor, scubaReportCheck } from '../checks';
import { SCUBA_OBJECTIVES } from '../objective-map';
import { SCUBA_POLICIES } from '../policies.generated';
import { compactScubaResults, policyBaseId, stripHtml } from '../results';

const SAMPLE = JSON.parse(readFileSync(join(__dirname, 'fixtures/ScubaResults_sample.json'), 'utf-8'));
const compact = compactScubaResults(SAMPLE);
const checks = buildPolicyChecks();
const checkById = new Map(checks.map((c) => [c.id, c]));

function makeCtx(stored: string | undefined, variables: CheckVariableValues = {}) {
  const passed: CheckPassingResult[] = [];
  const failed: CheckFindingResult[] = [];
  const logs: string[] = [];
  const ctx = {
    accessToken: '',
    credentials: stored === undefined ? {} : { scubaResults: stored },
    variables,
    connectionId: 'conn_1',
    organizationId: 'org_1',
    log: (m: string) => logs.push(m),
    warn: (m: string) => logs.push(m),
    error: (m: string) => logs.push(m),
    pass: (r: CheckPassingResult) => passed.push(r),
    fail: (r: CheckFindingResult) => failed.push(r),
  } as unknown as CheckContext;
  return { ctx, passed, failed, logs };
}

/** Fresh report: shift the sample's timestamp to today so age checks pass. */
function fresh(ageDays = 0): string {
  const copy = structuredClone(compact);
  copy.meta.timestamp = new Date(Date.now() - ageDays * 86_400_000).toISOString();
  return JSON.stringify(copy);
}

describe('ScubaGear results compaction', () => {
  it('drops Raw, keeps metadata and every policy', () => {
    expect(compact.format).toBe('comp-scuba/1');
    expect(compact.meta.tool).toBe('ScubaGear');
    expect(compact.meta.toolVersion).toBe('2.0.0');
    expect(compact.meta.productsAssessed).toHaveLength(7);
    expect(compact.policies).toHaveLength(109);
    expect(JSON.stringify(compact).length).toBeLessThan(200_000);
  });

  it('strips the HTML indicators from requirement text', () => {
    const p = compact.policies.find((x) => x.id === 'MS.AAD.1.1v1')!;
    expect(p.requirement).toBe('Legacy authentication SHALL be blocked.');
    expect(p.bod2501).toBe(true);
    expect(p.criticality).toBe('Shall');
    expect(p.manual).toBe(false);
    expect(stripHtml('a<br/>b &amp; c <a href="x">d</a>')).toBe('a b & c d');
  });

  it('flags manual policies', () => {
    const p = compact.policies.find((x) => x.id === 'MS.AAD.4.1v1')!;
    expect(p.manual).toBe(true);
    expect(p.result).toBe('N/A');
  });

  it('rejects files that are not ScubaGear results', () => {
    expect(() => compactScubaResults({ hello: 1 })).toThrow(/MetaData/);
    expect(() => compactScubaResults({ MetaData: { Tool: 'ScubaGoggles' }, Results: {} })).toThrow(/Unsupported tool/);
  });
});

describe('policy catalogue and objective map', () => {
  it('has one check per policy with stable ids', () => {
    expect(checks).toHaveLength(SCUBA_POLICIES.length);
    expect(checkIdFor('MS.AAD.3.2')).toBe('scuba-ms-aad-3-2');
    expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length);
  });

  it('maps every objective key to a known policy', () => {
    const bases = new Set(SCUBA_POLICIES.map((p) => p.base));
    for (const key of Object.keys(SCUBA_OBJECTIVES)) expect(bases.has(key)).toBe(true);
  });

  it('gives mapped policies a task template and leaves the rest evidence-only', () => {
    expect(checkById.get('scuba-ms-aad-3-1')!.taskMapping).toBeDefined();
    expect(checkById.get('scuba-ms-aad-6-1')!.taskMapping).toBeUndefined();
    const mapped = checks.filter((c) => c.taskMapping).length;
    expect(mapped).toBe(Object.keys(SCUBA_OBJECTIVES).length);
  });

  it('registers the manifest with a service per product', () => {
    expect(scubaGearManifest.checks).toHaveLength(checks.length + 1);
    expect(scubaGearManifest.services!.map((s) => s.id)).toEqual([
      'report', 'aad', 'exo', 'sharepoint', 'teams', 'powerplatform', 'powerbi', 'securitysuite',
    ]);
  });
});

describe('policy checks', () => {
  it('passes a Pass policy with evidence', async () => {
    const { ctx, passed, failed } = makeCtx(fresh());
    await checkById.get('scuba-ms-aad-2-1')!.run(ctx);
    expect(failed).toHaveLength(0);
    expect(passed).toHaveLength(1);
    expect(passed[0].resourceId).toBe('MS.AAD.2.1v1');
    expect(passed[0].evidence.result).toBe('Pass');
    expect(passed[0].evidence.nist800171Objective).toBe('3.14.6[a]');
    expect(passed[0].evidence.nist80053).toEqual(['AC-2(12)', 'AC-2(13)']);
  });

  it('fails a failed SHALL policy with high severity and baseline guidance', async () => {
    const { ctx, passed, failed } = makeCtx(fresh());
    await checkById.get('scuba-ms-aad-1-1')!.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0].severity).toBe('high');
    expect(failed[0].remediation).toContain('baselines/aad.md');
  });

  it('records a Warning as informational by default and as a finding when asked', async () => {
    const info = makeCtx(fresh());
    await checkById.get('scuba-ms-aad-3-7')!.run(info.ctx);
    expect(info.failed).toHaveLength(0);
    expect(info.passed[0].title).toMatch(/^Recommendation not met/);
    expect(info.passed[0].evidence.result).toBe('Warning');

    const strict = makeCtx(fresh(), { should_policies: 'findings' });
    await checkById.get('scuba-ms-aad-3-7')!.run(strict.ctx);
    expect(strict.passed).toHaveLength(0);
    expect(strict.failed[0].severity).toBe('low');
  });

  it('records nothing for manual (N/A) policies', async () => {
    const { ctx, passed, failed, logs } = makeCtx(fresh());
    await checkById.get('scuba-ms-aad-4-1')!.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(0);
    expect(logs.join(' ')).toContain('manual');
  });

  it('matches a policy by versionless id when the report has a different version', async () => {
    const copy = structuredClone(compact);
    copy.meta.timestamp = new Date().toISOString();
    const p = copy.policies.find((x) => x.id === 'MS.AAD.3.2v2')!;
    p.id = 'MS.AAD.3.2v3';
    const { ctx, passed } = makeCtx(JSON.stringify(copy));
    await checkById.get('scuba-ms-aad-3-2')!.run(ctx);
    expect(passed[0].resourceId).toBe('MS.AAD.3.2v3');
    expect(policyBaseId('MS.AAD.3.2v3')).toBe('MS.AAD.3.2');
  });

  it('accepts a raw ScubaResults file pasted as the credential', async () => {
    const raw = structuredClone(SAMPLE);
    raw.MetaData.TimestampZulu = new Date().toISOString();
    const { ctx, passed } = makeCtx(JSON.stringify(raw));
    await checkById.get('scuba-ms-exo-1-1')!.run(ctx);
    expect(passed).toHaveLength(1);
  });

  it('reports a stale report instead of its policies', async () => {
    const { ctx, passed, failed } = makeCtx(fresh(120));
    await checkById.get('scuba-ms-exo-1-1')!.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed[0].title).toMatch(/stale/);
    const lenient = makeCtx(fresh(120), { max_report_age_days: 180 });
    await checkById.get('scuba-ms-exo-1-1')!.run(lenient.ctx);
    expect(lenient.passed).toHaveLength(1);
  });

  it('records nothing when no results were uploaded', async () => {
    const { ctx, passed, failed } = makeCtx(undefined);
    await checkById.get('scuba-ms-exo-1-1')!.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });
});

describe('report check', () => {
  it('fails when nothing is uploaded and passes with the summary otherwise', async () => {
    const empty = makeCtx(undefined);
    await scubaReportCheck.run(empty.ctx);
    expect(empty.failed[0].title).toMatch(/No ScubaGear results/);

    const ok = makeCtx(fresh(3));
    await scubaReportCheck.run(ok.ctx);
    expect(ok.failed).toHaveLength(0);
    expect(ok.passed[0].evidence.policyCount).toBe(109);
    expect(ok.passed[0].evidence.unknownPolicies).toEqual([]);
    expect(ok.passed[0].evidence.reportAgeDays).toBe(3);
  });
});
