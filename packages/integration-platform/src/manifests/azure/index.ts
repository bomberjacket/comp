import type { IntegrationManifest } from '../../types';
import { environmentAliasesVariable } from '../environment-aliases';
import {
  entraLogExportCheck,
  environmentSeparationCheck,
  keyVaultProtectionCheck,
  keyVaultRbacCheck,
  monitorLoggingAlertingCheck,
  mysqlFlexibleTlsCheck,
  nsgNoOpenPortsCheck,
  postgresqlFlexibleTlsCheck,
  rbacLeastPrivilegeCheck,
  sentinelAnalyticsRulesCheck,
  sentinelDataConnectorsCheck,
  sentinelDetectionCapabilityCheck,
  sentinelLogRetentionCheck,
  sentinelOpenIncidentsCheck,
  sqlAuditingCheck,
  sqlPublicAccessCheck,
  sqlTlsCheck,
  storageEncryptionCheck,
  storageHttpsTlsCheck,
  storagePublicAccessCheck,
} from './checks';
import { sentinelRetentionDaysVariable } from './checks/sentinel-shared';
import { AZURE_CLOUDS, armBase, type AzureCloud } from './checks/shared';

/**
 * One factory, two manifests: commercial Azure (which GCC tenants use) and
 * Azure Government (GCC High: ITAR / foreign military sales only). The checks
 * read the cloud from the connection's token, so the same check code serves
 * both; only the sign-in, management and portal hosts differ.
 */
export function createAzureManifest(cloud: AzureCloud): IntegrationManifest {
  const { arm, login, portal, label } = AZURE_CLOUDS[cloud];
  const isGov = cloud === 'government';

  return {
    id: isGov ? 'azure-gov' : 'azure',
    name: label,
    description: isGov
      ? 'Read-only monitoring of security posture, identity, network, Sentinel and compliance in Azure Government (GCC High tenants: ITAR / foreign military sales only)'
      : 'Read-only monitoring of security posture, identity, network, Sentinel and compliance in Microsoft Azure',
    category: 'Cloud',
    logoUrl: 'https://img.logo.dev/azure.com?token=pk_AZatYxV5QDSfWpRDaBxzRQ',
    docsUrl: isGov
      ? 'https://learn.microsoft.com/azure/azure-government/'
      : 'https://docs.microsoft.com/en-us/azure/defender-for-cloud/',
    supportsMultipleConnections: true,
    isActive: true,

    auth: {
      type: 'oauth2',
      config: {
        authorizeUrl: `${login}/common/oauth2/v2.0/authorize`,
        tokenUrl: `${login}/common/oauth2/v2.0/token`,
        scopes: [`${arm}/user_impersonation`, 'offline_access', 'openid', 'profile'],
        pkce: false,
        clientAuthMethod: 'body',
        supportsRefreshToken: true,
        authorizationParams: {
          prompt: 'consent',
        },
        setupInstructions: `## Platform Admin: Enable Azure OAuth

1. Go to [${isGov ? 'Azure Government Portal' : 'Azure Portal'} → App registrations](${portal}/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Name: \`CompAI Cloud Tests\`
4. Supported account types: **Accounts in any organizational directory** (Multitenant)
5. Redirect URI: Add the callback URL shown below as **Web** type
6. Click **Register**
7. Copy the **Application (client) ID** and paste below
8. Go to **Certificates & secrets** → **New client secret** → copy the **Value**

---

### About Permissions

**OAuth Scope:** This integration uses the \`user_impersonation\` scope on the Azure Resource Manager API (${arm}). This allows API calls on behalf of the signed-in user.

**Actual Access is Controlled by Azure RBAC:** The OAuth scope only enables API calls. The user can only access resources their Azure roles allow. Users connecting should have at minimum:
- **Reader** — general resource visibility
- **Security Reader** — Microsoft Defender for Cloud data
- **Microsoft Sentinel Reader** on the Sentinel workspace — data connectors, analytics rules, incidents (Reader alone does not see Sentinel content)
- An Entra ID role such as **Security Reader** or **Global Reader** — the tenant-level Entra ID diagnostic settings read by the log export check

Our integration only makes read-only API calls for security scanning.${
          isGov
            ? `

### Azure Government

This entry uses \`${login}\` and \`${arm}\`. CMMC Level 2 requires GCC, whose subscriptions live in commercial Azure and use the "Microsoft Azure" entry; Azure Government applies only to GCC High tenants with ITAR / foreign military sales contracts.`
            : `

### GCC

GCC tenants keep their Azure subscriptions in commercial Azure, so this entry covers both commercial and GCC. GCC High tenants use the "Microsoft Azure Government" entry.`
        }`,
        createAppUrl: `${portal}/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`,
      },
    },

    baseUrl: arm,

    capabilities: ['checks'],

    services: [
      {
        id: 'defender',
        name: 'Microsoft Defender for Cloud',
        description: 'Cloud security posture management and threat protection',
        enabledByDefault: true,
        implemented: true,
      },
      {
        id: 'entra-id',
        name: 'Microsoft Entra ID',
        description: 'Identity and access management monitoring',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'policy',
        name: 'Azure Policy',
        description: 'Resource compliance and governance policy evaluation',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'key-vault',
        name: 'Key Vault',
        description: 'Secret, key, and certificate management monitoring',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'monitor',
        name: 'Azure Monitor',
        description: 'Activity logs and diagnostic settings audit',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'sentinel',
        name: 'Microsoft Sentinel',
        description:
          'SIEM evidence for NIST SP 800-171: log retention (3.3.1), Entra ID log export (3.3.1), data connectors (3.3.5), analytics rules (3.14.6, 3.6.1), open incidents (3.6.2)',
        enabledByDefault: true,
        implemented: true,
      },
      {
        id: 'network-watcher',
        name: 'Network Watcher',
        description: 'Network security group and flow log monitoring',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'storage-account',
        name: 'Storage Accounts',
        description: 'HTTPS enforcement, public access, TLS version, and encryption checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'sql-database',
        name: 'SQL Database',
        description: 'Auditing, TDE, firewall rules, and public access checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'mysql-flexible',
        name: 'Database for MySQL',
        description: 'Flexible Server TLS 1.2 / secure transport enforcement checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'postgresql-flexible',
        name: 'Database for PostgreSQL',
        description: 'Flexible Server TLS 1.2 / secure transport enforcement checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'virtual-machine',
        name: 'Virtual Machines',
        description: 'Disk encryption, managed identity, and secure boot checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'app-service',
        name: 'App Service',
        description: 'HTTPS enforcement, TLS, managed identity, and remote debugging checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'aks',
        name: 'AKS',
        description: 'Kubernetes RBAC, network policies, private cluster, and auto-upgrade checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'container-registry',
        name: 'Container Registry',
        description: 'Admin user, content trust, public access, and retention policy checks',
        enabledByDefault: false,
        implemented: true,
      },
      {
        id: 'cosmos-db',
        name: 'Cosmos DB',
        description: 'Public access, key-based auth, failover, and backup configuration checks',
        enabledByDefault: false,
        implemented: true,
      },
    ],

    variables: [
      {
        id: 'subscription_ids',
        label: 'Azure Subscriptions',
        type: 'multi-select',
        required: false,
        helpText:
          'Select which subscriptions to scan (select all to scan everything). Leave empty to keep scanning the single auto-detected subscription.',
        fetchOptions: async (ctx) => {
          try {
            type SubsPage = {
              value?: Array<{
                subscriptionId: string;
                displayName?: string;
                state?: string;
              }>;
              nextLink?: string;
            };
            const subs: NonNullable<SubsPage['value']> = [];
            // ARM paginates via nextLink — follow it so large tenants can see
            // and select every subscription. The page cap matches armListAll's
            // (a loop guard against malformed nextLink chains, not a budget).
            const host = armBase(ctx);
            let url: string | undefined = `${host}/subscriptions?api-version=2020-01-01`;
            let pages = 0;
            while (url && pages < 50) {
              const data: SubsPage = await ctx.fetch<SubsPage>(url);
              subs.push(...(data.value ?? []));
              // only follow nextLink on this cloud's ARM host, so the bearer
              // token can't be sent elsewhere
              url =
                data.nextLink && data.nextLink.startsWith(`${host}/`) ? data.nextLink : undefined;
              pages++;
            }
            return subs
              .filter((s) => s.state === 'Enabled')
              .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
              .map((s) => ({
                value: s.subscriptionId,
                label: s.displayName ? `${s.displayName} (${s.subscriptionId})` : s.subscriptionId,
              }));
          } catch {
            // Graceful empty picker (matches the GCP project_ids precedent) —
            // the user can still rely on the saved subscription_id default.
            return [];
          }
        },
      },
      {
        // Kept for the Cloud Tests product, which auto-detects and reads this
        // value on its own path. The evidence checks scope via subscription_ids
        // and only fall back to this when subscriptions cannot be listed.
        id: 'subscription_id',
        label: 'Azure Subscription ID',
        type: 'text',
        required: false,
        helpText: `Auto-detected after connecting. If not detected, find it at ${portal.replace('https://', '')} → Subscriptions`,
        placeholder: 'Auto-detected',
      },
      environmentAliasesVariable,
      sentinelRetentionDaysVariable,
    ],

    checks: [
      storageHttpsTlsCheck,
      storagePublicAccessCheck,
      storageEncryptionCheck,
      sqlTlsCheck,
      sqlPublicAccessCheck,
      sqlAuditingCheck,
      mysqlFlexibleTlsCheck,
      postgresqlFlexibleTlsCheck,
      keyVaultProtectionCheck,
      keyVaultRbacCheck,
      nsgNoOpenPortsCheck,
      rbacLeastPrivilegeCheck,
      monitorLoggingAlertingCheck,
      environmentSeparationCheck,
      sentinelLogRetentionCheck,
      entraLogExportCheck,
      sentinelDataConnectorsCheck,
      sentinelAnalyticsRulesCheck,
      sentinelDetectionCapabilityCheck,
      sentinelOpenIncidentsCheck,
    ],
  };
}

export const azureManifest = createAzureManifest('commercial');
export const azureGovManifest = createAzureManifest('government');

export { AZURE_CLOUDS, armBase, azureCloud, azureCloudFromToken } from './checks/shared';
export type { AzureCloud } from './checks/shared';
