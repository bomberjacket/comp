import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import { unverified } from './sentinel-shared';
import { ARM_BASE } from './shared';

interface EntraDiagnosticSetting {
  id?: string;
  name: string;
  properties?: {
    workspaceId?: string | null;
    storageAccountId?: string | null;
    eventHubAuthorizationRuleId?: string | null;
    logs?: Array<{ category?: string; enabled?: boolean }>;
  };
}

/** Required for 3.3.1 on an Entra tenant: who signed in, and what changed in the directory. */
export const REQUIRED_CATEGORIES = ['SignInLogs', 'AuditLogs'];
/** Worth exporting too; their absence is a low finding. */
export const RECOMMENDED_CATEGORIES = [
  'NonInteractiveUserSignInLogs',
  'ServicePrincipalSignInLogs',
  'ManagedIdentitySignInLogs',
  'ProvisioningLogs',
  'RiskyUsers',
  'UserRiskEvents',
];

const resourceName = (id: string | null | undefined) => (id ? (id.split('/').pop() ?? id) : null);

/** Categories exported by settings that have a destination. */
export function exportedCategories(settings: EntraDiagnosticSetting[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of settings) {
    const p = s.properties ?? {};
    const destinations = [
      p.workspaceId ? `workspace:${resourceName(p.workspaceId)}` : null,
      p.storageAccountId ? `storage:${resourceName(p.storageAccountId)}` : null,
      p.eventHubAuthorizationRuleId ? 'eventhub' : null,
    ].filter((d): d is string => !!d);
    if (destinations.length === 0) continue;
    for (const l of p.logs ?? []) {
      if (!l.enabled || !l.category) continue;
      out.set(l.category, [...(out.get(l.category) ?? []), ...destinations]);
    }
  }
  return out;
}

/** 3.3.1[f] Audit records are retained as defined: Entra ID logs leave the 30-day store. */
export const entraLogExportCheck: IntegrationCheck = {
  id: 'entra-log-export',
  name: 'Entra ID log export (3.3.1)',
  description:
    'Reads the tenant-level Entra ID diagnostic settings and confirms sign-in and audit logs are exported to a Log Analytics (Sentinel) workspace or storage account, which is the only way they outlive Entra’s 30-day store. Evidence for 3.3.1[f]. The connecting account needs an Entra role such as Security Reader or Global Reader in addition to Azure Reader.',
  service: 'sentinel',
  taskMapping: TASK_TEMPLATES['3.3.1[f]'],
  defaultSeverity: 'medium',

  run: async (ctx) => {
    let settings: EntraDiagnosticSetting[];
    try {
      const data = await ctx.fetch<{ value?: EntraDiagnosticSetting[] }>(
        `${ARM_BASE}/providers/microsoft.aadiam/diagnosticSettings?api-version=2017-04-01-preview`,
      );
      settings = data.value ?? [];
    } catch (err) {
      unverified(
        ctx,
        'Entra ID diagnostic settings',
        'tenant',
        err,
        'Connect with an account that holds Security Reader or Global Reader in Entra ID (reading tenant diagnostic settings needs an Entra role, not only Azure Reader), then re-run the check.',
      );
      return;
    }
    const exported = exportedCategories(settings);
    ctx.log(`Entra diagnostic settings: ${settings.length}, categories exported: ${exported.size}`);

    const missingRequired = REQUIRED_CATEGORIES.filter((c) => !exported.has(c));
    const missingRecommended = RECOMMENDED_CATEGORIES.filter((c) => !exported.has(c));
    const evidence = {
      settings: settings.map((s) => ({
        name: s.name,
        workspace: resourceName(s.properties?.workspaceId),
        storageAccount: resourceName(s.properties?.storageAccountId),
        eventHub: !!s.properties?.eventHubAuthorizationRuleId,
        enabledCategories: (s.properties?.logs ?? [])
          .filter((l) => l.enabled)
          .map((l) => l.category),
      })),
      exportedCategories: Object.fromEntries([...exported.entries()].sort()),
      missingRequired,
      missingRecommended,
    };

    if (settings.length === 0) {
      ctx.fail({
        title: 'Entra ID logs are not exported',
        description:
          'No diagnostic setting exists on the Entra ID tenant, so sign-in and audit logs are discarded after 30 days (7 on Entra ID Free).',
        resourceType: 'entra-tenant',
        resourceId: 'tenant',
        severity: 'medium',
        remediation:
          'In Entra ID, Monitoring, Diagnostic settings, add a setting that sends AuditLogs, SignInLogs and the non-interactive and service principal sign-in categories to the Sentinel workspace.',
        evidence,
      });
      return;
    }

    if (missingRequired.length > 0) {
      ctx.fail({
        title: `Entra ID export missing ${missingRequired.join(' and ')}`,
        description: `Diagnostic settings exist but ${missingRequired.join(' and ')} ${missingRequired.length === 1 ? 'is' : 'are'} not sent to any destination.`,
        resourceType: 'entra-tenant',
        resourceId: 'tenant',
        severity: 'medium',
        remediation: `Enable ${missingRequired.join(' and ')} on the diagnostic setting that targets the Sentinel workspace.`,
        evidence,
      });
    } else {
      ctx.pass({
        title: 'Entra ID sign-in and audit logs are exported',
        description: `SignInLogs go to ${[...new Set(exported.get('SignInLogs'))].join(', ')}; AuditLogs go to ${[...new Set(exported.get('AuditLogs'))].join(', ')}.`,
        resourceType: 'entra-tenant',
        resourceId: 'tenant',
        evidence,
      });
    }

    if (missingRecommended.length > 0) {
      ctx.fail({
        title: `Entra ID export without ${missingRecommended.length} recommended categories`,
        description: `Not exported: ${missingRecommended.join(', ')}. Non-interactive and service principal sign-ins carry most automated access to CUI.`,
        resourceType: 'entra-tenant',
        resourceId: 'tenant/recommended',
        severity: 'low',
        remediation:
          'Add the missing categories to the diagnostic setting, or document why they are out of scope.',
        evidence,
      });
    }
  },
};
