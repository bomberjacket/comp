import type { IntegrationManifest } from '../../types';
import {
  conditionalAccessMfaCheck,
  defenderOpenAlertsCheck,
  defenderRealTimeProtectionCheck,
  defenderRealTimeScansCheck,
  defenderScansCheck,
  defenderSignaturesCheck,
  inactiveAccountsCheck,
  intuneCompliancePoliciesCheck,
  intuneDeviceComplianceCheck,
  intuneDeviceEncryptionCheck,
  intuneDeviceInventoryCheck,
  intuneMobileEncryptionCheck,
  intuneStaleDevicesCheck,
  mfaAllUsersCheck,
  mfaPrivilegedUsersCheck,
  privilegedAccountsForMfaCheck,
  privilegedAccountsIdentifiedCheck,
  usersIdentifiedCheck,
} from './checks';
import { MICROSOFT_CLOUDS, type MicrosoftCloud } from './graph';
import {
  deviceStaleDaysVariable,
  inactiveDaysVariable,
  includeDisabledVariable,
  includeGuestsVariable,
  scanMaxDaysVariable,
} from './variables';

/** Delegated Graph permissions; an admin grants consent once when connecting. */
const GRAPH_PERMISSIONS = [
  'User.Read.All',
  'Directory.Read.All',
  'AuditLog.Read.All',
  'UserAuthenticationMethod.Read.All',
  'Policy.Read.All',
  'DeviceManagementManagedDevices.Read.All',
  'DeviceManagementConfiguration.Read.All',
  'SecurityAlert.Read.All',
];

/**
 * Microsoft 365 tenant evidence through Microsoft Graph: Entra ID (users,
 * privileged roles, MFA, Conditional Access), Intune (inventory, compliance,
 * encryption) and Defender (antivirus state through Intune, XDR alerts).
 *
 * One factory, two manifests: commercial / GCC share endpoints, GCC High uses
 * the `.us` cloud. Checks use paths relative to the Graph host, so the same
 * check code serves both.
 */
export function createMicrosoft365Manifest(cloud: MicrosoftCloud): IntegrationManifest {
  const { login, graph, label } = MICROSOFT_CLOUDS[cloud];
  const isGov = cloud === 'gcc-high';
  const portal = isGov ? 'https://entra.microsoft.us' : 'https://entra.microsoft.com';

  return {
    id: isGov ? 'microsoft-365-gcc-high' : 'microsoft-365',
    name: label,
    description: isGov
      ? 'Read-only evidence from a Microsoft 365 GCC High tenant (Entra ID, Intune, Defender) for NIST SP 800-171. ITAR / foreign military sales tenants only.'
      : 'Read-only evidence from a Microsoft 365 or GCC tenant: Entra ID users, privileged roles, MFA and Conditional Access; Intune inventory, compliance and encryption; Defender antivirus state and open alerts. Mapped to NIST SP 800-171 assessment objectives.',
    category: 'Identity & Access',
    logoUrl:
      'https://img.logo.dev/microsoft.com?token=pk_AZatYxV5QDSfWpRDaBxzRQ&format=png&retina=true',
    docsUrl: 'https://learn.microsoft.com/graph/overview',
    supportsMultipleConnections: true,
    isActive: true,

    auth: {
      type: 'oauth2',
      config: {
        authorizeUrl: `${login}/organizations/oauth2/v2.0/authorize`,
        tokenUrl: `${login}/organizations/oauth2/v2.0/token`,
        scopes: [
          ...GRAPH_PERMISSIONS.map((p) => `${graph}/${p}`),
          'offline_access',
          'openid',
          'profile',
        ],
        pkce: false,
        clientAuthMethod: 'body',
        supportsRefreshToken: true,
        authorizationParams: { prompt: 'consent' },
        setupInstructions: `## Platform admin: register the app in Entra ID

1. Open [${portal} → App registrations](${portal}/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) and click **New registration**
2. Name: \`Comp AI Evidence\`
3. Supported account types: **Accounts in this organizational directory only** for a single client tenant, or **Accounts in any organizational directory** when one registration serves several client tenants
4. Redirect URI: add the callback URL shown below as **Web**
5. **Register**, then copy the **Application (client) ID** into the field below
6. **Certificates & secrets** → **New client secret** → copy the **Value** into the field below
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated** → add: ${GRAPH_PERMISSIONS.map((p) => `\`${p}\``).join(', ')} → **Grant admin consent**

### Who connects

The person who clicks Connect signs in with a work account in the client tenant. Graph returns only what that account may read, so use an account holding **Global Reader** (covers Entra ID and Intune) plus **Security Reader** (covers Defender alerts), or a Global Administrator for the one-time consent. All calls are read-only.

### Licensing

- **Entra ID P1** (in Microsoft 365 G3/G5, E3/E5, Business Premium): the MFA registration report and sign-in activity. Without it those checks report "could not verify".
- **Intune Plan 1** (in the same bundles): the inventory, compliance, encryption and Defender Antivirus state checks. Only devices enrolled in Intune are seen.
- **Defender for Endpoint, Defender for Business or another Defender XDR product**: the open-alerts check. Antivirus state needs no Defender licence; it is Defender Antivirus built into Windows, reported through Intune.${isGov ? '\n\n### GCC High\n\nThis manifest uses `login.microsoftonline.us` and `graph.microsoft.us`. CMMC Level 2 requires GCC, not GCC High; GCC High applies only to contracts with ITAR / foreign military sales.' : '\n\n### GCC\n\nGCC tenants use the commercial sign-in and Graph endpoints, so this manifest covers both commercial and GCC. GCC High has its own entry.'}`,
        createAppUrl: `${portal}/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`,
      },
    },

    baseUrl: graph,
    defaultHeaders: { Accept: 'application/json' },

    capabilities: ['checks'],

    services: [
      {
        id: 'identity',
        name: 'Entra ID directory',
        description: 'Authorized users (3.1.1) and privileged accounts (3.1.5)',
        enabledByDefault: true,
        implemented: true,
      },
      {
        id: 'mfa',
        name: 'MFA and Conditional Access',
        description:
          'MFA registration for all and privileged users, Conditional Access enforcement (3.5.3)',
        enabledByDefault: true,
        implemented: true,
      },
      {
        id: 'account-lifecycle',
        name: 'Account lifecycle',
        description: 'Inactive accounts still enabled (3.5.6)',
        enabledByDefault: true,
        implemented: true,
      },
      {
        id: 'intune',
        name: 'Intune',
        description:
          'Device inventory and currency (3.4.1), compliance policies and enforcement (3.4.2), device encryption (3.13.16, 3.1.19)',
        enabledByDefault: true,
        implemented: true,
      },
      {
        id: 'defender-endpoint',
        name: 'Defender',
        description:
          'Defender Antivirus real-time protection, signatures and scans on Windows devices (3.14.2, 3.14.4, 3.14.5) and open Defender XDR alerts (3.14.6)',
        enabledByDefault: true,
        implemented: true,
      },
    ],

    variables: [
      includeGuestsVariable,
      includeDisabledVariable,
      inactiveDaysVariable,
      deviceStaleDaysVariable,
      scanMaxDaysVariable,
    ],

    checks: [
      usersIdentifiedCheck,
      privilegedAccountsIdentifiedCheck,
      privilegedAccountsForMfaCheck,
      mfaAllUsersCheck,
      mfaPrivilegedUsersCheck,
      conditionalAccessMfaCheck,
      inactiveAccountsCheck,
      intuneDeviceInventoryCheck,
      intuneStaleDevicesCheck,
      intuneCompliancePoliciesCheck,
      intuneDeviceComplianceCheck,
      intuneDeviceEncryptionCheck,
      intuneMobileEncryptionCheck,
      defenderRealTimeProtectionCheck,
      defenderRealTimeScansCheck,
      defenderSignaturesCheck,
      defenderScansCheck,
      defenderOpenAlertsCheck,
    ],
  };
}

export const microsoft365Manifest = createMicrosoft365Manifest('commercial');
export const microsoft365GccHighManifest = createMicrosoft365Manifest('gcc-high');

export { MICROSOFT_CLOUDS, PRIVILEGED_ROLE_TEMPLATES } from './graph';
export type { MicrosoftCloud } from './graph';
export * from './types';
