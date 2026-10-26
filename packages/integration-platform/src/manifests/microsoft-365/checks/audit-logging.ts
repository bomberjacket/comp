import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { daysSince, emitUnverified } from '../graph';
import type { GraphDirectoryAudit, GraphList, GraphSignIn } from '../types';
import { auditRetentionDaysVariable, parseAuditOptions } from '../variables';

const AUDITS = '/v1.0/auditLogs/directoryAudits';
const SIGN_INS = '/v1.0/auditLogs/signIns';
const AUDIT_FIELDS = 'id,activityDateTime,activityDisplayName,category,loggedByService,result';
const SIGN_IN_FIELDS = 'id,createdDateTime,appDisplayName';
const PERMISSION =
  'AuditLog.Read.All (the connecting account needs Security Reader or Reports Reader)';

/** Entra ID keeps sign-in and audit logs for 7 days (Free) or 30 days (P1/P2); nothing longer without export. */
export const ENTRA_NATIVE_RETENTION_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;

const isoDaysAgo = (days: number, now: number) => new Date(now - days * 86_400_000).toISOString();

/** True for the 403 Graph returns for sign-in logs on a tenant without Entra ID P1. */
function isNonPremiumTenant(err: unknown): boolean {
  return err instanceof Error && /NonPremiumTenant|premium/i.test(err.message);
}

async function recentSignIns(
  ctx: CheckContext,
  now: number,
): Promise<GraphSignIn[] | 'unlicensed' | null> {
  try {
    const page = await ctx.fetch<GraphList<GraphSignIn>>(SIGN_INS, {
      params: {
        $filter: `createdDateTime ge ${isoDaysAgo(RECENT_WINDOW_DAYS, now)}`,
        $top: '50',
        $select: SIGN_IN_FIELDS,
      },
    });
    return page.value ?? [];
  } catch (err) {
    if (isNonPremiumTenant(err)) return 'unlicensed';
    ctx.warn('Could not read sign-in logs', { error: String(err) });
    return null;
  }
}

/** 3.3.1[c] Audit records are created (generated). */
export const entraAuditRecordsCheck: IntegrationCheck = {
  id: 'entra-audit-records-generated',
  name: 'Entra ID audit records generated (3.3.1)',
  description:
    'Confirms Entra ID is producing directory audit records and sign-in records (last 7 days), with the categories and services seen. Evidence for 3.3.1[c]. Sign-in logs need Entra ID P1.',
  service: 'audit',
  taskMapping: TASK_TEMPLATES['3.3.1[c]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const now = Date.now();
    let audits: GraphDirectoryAudit[];
    try {
      const page = await ctx.fetch<GraphList<GraphDirectoryAudit>>(AUDITS, {
        params: {
          $filter: `activityDateTime ge ${isoDaysAgo(RECENT_WINDOW_DAYS, now)}`,
          $top: '50',
          $select: AUDIT_FIELDS,
        },
      });
      audits = page.value ?? [];
    } catch (err) {
      emitUnverified(
        ctx,
        { what: 'Entra ID audit logs', resourceType: 'tenant', permission: PERMISSION },
        err,
      );
      return;
    }
    const signIns = await recentSignIns(ctx, now);
    ctx.log(
      `Audit records in ${RECENT_WINDOW_DAYS} days: ${audits.length} directory audits (sample), sign-ins ${signIns === 'unlicensed' ? 'unlicensed' : signIns === null ? 'unreadable' : `${signIns.length} (sample)`}`,
    );

    const newest =
      audits
        .map((a) => a.activityDateTime)
        .sort()
        .at(-1) ?? null;
    const evidence = {
      windowDays: RECENT_WINDOW_DAYS,
      directoryAuditSample: audits.length,
      newestDirectoryAudit: newest,
      categories: [...new Set(audits.map((a) => a.category).filter(Boolean))].sort(),
      services: [...new Set(audits.map((a) => a.loggedByService).filter(Boolean))].sort(),
      signInSample: Array.isArray(signIns) ? signIns.length : null,
      signInLogs:
        signIns === 'unlicensed'
          ? 'not available (Entra ID P1 required)'
          : signIns === null
            ? 'unreadable'
            : 'available',
      newestSignIn: Array.isArray(signIns)
        ? (signIns
            .map((s) => s.createdDateTime)
            .sort()
            .at(-1) ?? null)
        : null,
    };

    if (audits.length === 0) {
      ctx.fail({
        title: `No Entra ID audit records in the last ${RECENT_WINDOW_DAYS} days`,
        description:
          'The directory audit log returned nothing for the last week. Either the tenant had no directory activity or the read is incomplete; audit generation cannot be confirmed.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        severity: 'medium',
        remediation:
          'Make an administrative change (for example, update a group) and re-run the check. If records still do not appear, confirm the connecting account holds Security Reader or Reports Reader.',
        evidence,
      });
      return;
    }

    ctx.pass({
      title: 'Entra ID audit records are being generated',
      description: `Directory audit records exist for the last ${RECENT_WINDOW_DAYS} days (newest ${newest?.slice(0, 19) ?? 'unknown'}); sign-in logs ${evidence.signInLogs}.`,
      resourceType: 'tenant',
      resourceId: 'tenant',
      evidence,
    });
  },
};

async function oldestSignIn(ctx: CheckContext): Promise<string | null> {
  try {
    const page = await ctx.fetch<GraphList<GraphSignIn>>(SIGN_INS, {
      params: { $orderby: 'createdDateTime asc', $top: '1', $select: SIGN_IN_FIELDS },
    });
    return page.value?.[0]?.createdDateTime ?? null;
  } catch (err) {
    if (!isNonPremiumTenant(err))
      ctx.warn('Could not read the oldest sign-in', { error: String(err) });
    return null;
  }
}

/** 3.3.1[f] Audit records are retained as defined. */
export const entraAuditRetentionCheck: IntegrationCheck = {
  id: 'entra-audit-retention',
  name: 'Audit log retention (3.3.1)',
  description:
    'Measures how far back Entra ID audit and sign-in records reach and compares that with the retention period defined for 3.3.1[e]. Entra keeps at most 30 days natively, so a longer period passes only through export to a Log Analytics (Sentinel) workspace or storage account, which this connection cannot see; Purview Audit retention for Exchange, SharePoint and Teams is likewise not readable through Graph.',
  service: 'audit',
  taskMapping: TASK_TEMPLATES['3.3.1[f]'],
  defaultSeverity: 'medium',
  variables: [auditRetentionDaysVariable],

  run: async (ctx) => {
    const { retentionDays } = parseAuditOptions(ctx.variables);
    const now = Date.now();
    let oldestAudit: GraphDirectoryAudit | undefined;
    try {
      const page = await ctx.fetch<GraphList<GraphDirectoryAudit>>(AUDITS, {
        params: { $orderby: 'activityDateTime asc', $top: '1', $select: AUDIT_FIELDS },
      });
      oldestAudit = page.value?.[0];
    } catch (err) {
      emitUnverified(
        ctx,
        { what: 'Entra ID audit log retention', resourceType: 'tenant', permission: PERMISSION },
        err,
      );
      return;
    }
    const oldestSignInAt = await oldestSignIn(ctx);
    const observed = Math.max(
      daysSince(oldestAudit?.activityDateTime, now) ?? -1,
      daysSince(oldestSignInAt, now) ?? -1,
    );
    const observedDays = observed < 0 ? null : observed;
    ctx.log(
      `Audit retention: observed ${observedDays ?? 'none'} days, defined ${retentionDays} days`,
    );

    const evidence = {
      definedRetentionDays: retentionDays,
      observedRetentionDays: observedDays,
      oldestDirectoryAudit: oldestAudit?.activityDateTime ?? null,
      oldestSignIn: oldestSignInAt,
      entraNativeMaximumDays: ENTRA_NATIVE_RETENTION_DAYS,
      exportsVisibleToThisCheck: false,
    };

    if (observedDays === null) {
      ctx.fail({
        title: 'No Entra ID audit records to measure retention',
        description:
          'The audit and sign-in logs returned no records, so the retention depth cannot be measured.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        severity: 'low',
        remediation:
          'Confirm the connecting account holds Security Reader or Reports Reader and that the tenant has directory activity, then re-run.',
        evidence,
      });
      return;
    }

    if (observedDays >= retentionDays) {
      ctx.pass({
        title: `Entra ID logs reach back ${observedDays} days (defined ${retentionDays})`,
        description: `The oldest retained record is ${observedDays} days old, which meets the ${retentionDays}-day retention period.`,
        resourceType: 'tenant',
        resourceId: 'tenant',
        evidence,
      });
      return;
    }

    const tier =
      observedDays >= ENTRA_NATIVE_RETENTION_DAYS - 1
        ? '30 days (Entra ID P1/P2)'
        : observedDays >= 6
          ? 'about 7 days (Entra ID Free) or a young log'
          : 'under a week';
    ctx.fail({
      title: `Entra ID holds ${observedDays} days of logs natively; defined period is ${retentionDays} days`,
      description: `The oldest record Graph returns is ${observedDays} days old, consistent with ${tier}. Entra ID never keeps more than ${ENTRA_NATIVE_RETENTION_DAYS} days on its own; a ${retentionDays}-day period is met only by exporting the logs, which this connection cannot see.`,
      resourceType: 'tenant',
      resourceId: 'tenant',
      severity: 'medium',
      remediation: `Export Entra sign-in and audit logs through Diagnostic settings to a Log Analytics workspace (Microsoft Sentinel) or a storage account with retention of at least ${retentionDays} days, and keep Exchange, SharePoint and Teams records under Purview Audit (180 days Standard, one year Premium, ten years with the add-on). Attach the workspace or storage retention setting to this task as the evidence that closes the gap.`,
      evidence,
    });
  },
};
