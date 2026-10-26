import { describe, expect, it } from 'bun:test';
import { entraAuditRecordsCheck, entraAuditRetentionCheck } from '../checks';
import type { GraphDirectoryAudit, GraphSignIn } from '../types';
import { DAY, denied, makeCtx, type Routes } from './test-context';

const AUDITS = '/v1.0/auditLogs/directoryAudits';
const SIGN_INS = '/v1.0/auditLogs/signIns';
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const nonPremium = Object.assign(
  new Error('HTTP 403: Authentication_RequestFromNonPremiumTenantOrB2CTenant'),
  { status: 403 },
);

const audit = (daysAgo: number, category = 'UserManagement'): GraphDirectoryAudit => ({
  id: `a-${daysAgo}`,
  activityDateTime: ago(daysAgo),
  activityDisplayName: 'Update user',
  category,
  loggedByService: 'Core Directory',
  result: 'success',
});
const signIn = (daysAgo: number): GraphSignIn => ({
  id: `s-${daysAgo}`,
  createdDateTime: ago(daysAgo),
});

/** Serve the newest records for a `ge` filter and the oldest for an `asc` order. */
const log = (all: GraphDirectoryAudit[]) => (params: Record<string, string>) => {
  if (params.$orderby?.endsWith('asc')) {
    return [...all]
      .sort((a, b) => a.activityDateTime.localeCompare(b.activityDateTime))
      .slice(0, 1);
  }
  const since = params.$filter?.match(/ge (\S+)/)?.[1];
  return since ? all.filter((a) => a.activityDateTime >= since) : all;
};
const signInLog = (all: GraphSignIn[]) => (params: Record<string, string>) => {
  if (params.$orderby?.endsWith('asc')) {
    return [...all].sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime)).slice(0, 1);
  }
  const since = params.$filter?.match(/ge (\S+)/)?.[1];
  return since ? all.filter((s) => s.createdDateTime >= since) : all;
};

describe('entraAuditRecordsCheck', () => {
  it('passes when directory audits exist in the last week and records the sign-in licence state', async () => {
    const { ctx, passed, failed } = makeCtx({
      [AUDITS]: log([audit(1), audit(3, 'GroupManagement'), audit(20)]),
      [SIGN_INS]: nonPremium,
    });
    await entraAuditRecordsCheck.run(ctx);
    expect(failed).toHaveLength(0);
    expect(passed).toHaveLength(1);
    expect(passed[0].evidence.directoryAuditSample).toBe(2);
    expect(passed[0].evidence.categories).toEqual(['GroupManagement', 'UserManagement']);
    expect(passed[0].evidence.signInLogs).toContain('P1 required');
  });

  it('fails when the week is empty and reports permission failures as unverified', async () => {
    const quiet = makeCtx({ [AUDITS]: log([audit(20)]), [SIGN_INS]: signInLog([signIn(2)]) });
    await entraAuditRecordsCheck.run(quiet.ctx);
    expect(quiet.failed.map((f) => f.title)).toEqual([
      'No Entra ID audit records in the last 7 days',
    ]);
    expect(quiet.failed[0].evidence?.signInSample).toBe(1);

    const blocked = makeCtx({ [AUDITS]: denied });
    await entraAuditRecordsCheck.run(blocked.ctx);
    expect(blocked.failed.map((f) => f.title)).toEqual(['Could not verify Entra ID audit logs']);
  });
});

describe('entraAuditRetentionCheck', () => {
  const thirtyDayTenant: Routes = {
    [AUDITS]: log([audit(1), audit(29)]),
    [SIGN_INS]: signInLog([signIn(2), signIn(29)]),
  };

  it('fails a one-year requirement against 30 days of native retention and names the export path', async () => {
    const { ctx, passed, failed } = makeCtx(thirtyDayTenant);
    await entraAuditRetentionCheck.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toBe(
      'Entra ID holds 29 days of logs natively; defined period is 365 days',
    );
    expect(failed[0].description).toContain('30 days (Entra ID P1/P2)');
    expect(failed[0].remediation).toContain('Log Analytics workspace (Microsoft Sentinel)');
    expect(failed[0].evidence?.observedRetentionDays).toBe(29);
    expect(failed[0].evidence?.exportsVisibleToThisCheck).toBe(false);
  });

  it('passes when the defined period fits inside what Entra holds', async () => {
    const { ctx, passed, failed } = makeCtx(thirtyDayTenant, { audit_retention_days: 14 });
    await entraAuditRetentionCheck.run(ctx);
    expect(failed).toHaveLength(0);
    expect(passed[0].title).toBe('Entra ID logs reach back 29 days (defined 14)');
  });

  it('uses the sign-in log when it reaches further than the audit log, and tolerates an unlicensed tenant', async () => {
    const a = makeCtx(
      { [AUDITS]: log([audit(5)]), [SIGN_INS]: signInLog([signIn(28)]) },
      { audit_retention_days: 20 },
    );
    await entraAuditRetentionCheck.run(a.ctx);
    expect(a.passed).toHaveLength(1);
    expect(a.passed[0].evidence.observedRetentionDays).toBe(28);

    const b = makeCtx(
      { [AUDITS]: log([audit(7)]), [SIGN_INS]: nonPremium },
      { audit_retention_days: 20 },
    );
    await entraAuditRetentionCheck.run(b.ctx);
    expect(b.failed[0].description).toContain('about 7 days (Entra ID Free) or a young log');
  });

  it('reports an empty log and a permission failure distinctly', async () => {
    const empty = makeCtx({ [AUDITS]: [], [SIGN_INS]: [] });
    await entraAuditRetentionCheck.run(empty.ctx);
    expect(empty.failed.map((f) => [f.title, f.severity])).toEqual([
      ['No Entra ID audit records to measure retention', 'low'],
    ]);

    const blocked = makeCtx({ [AUDITS]: denied });
    await entraAuditRetentionCheck.run(blocked.ctx);
    expect(blocked.failed.map((f) => f.title)).toEqual([
      'Could not verify Entra ID audit log retention',
    ]);
  });
});
