import type { IntegrationManifest } from '../../types';
import {
  conditionalAccessMfaCheck,
  inactiveAccountsCheck,
  mfaAllUsersCheck,
  mfaPrivilegedUsersCheck,
  privilegedAccountsForMfaCheck,
  privilegedAccountsIdentifiedCheck,
  usersIdentifiedCheck,
} from './checks';
import { MICROSOFT_CLOUDS, type MicrosoftCloud } from './graph';
import { inactiveDaysVariable, includeDisabledVariable, includeGuestsVariable } from './variables';

/** Delegated Graph permissions; an admin grants consent once when connecting. */
const GRAPH_PERMISSIONS = [
  'User.Read.All',
  'Directory.Read.All',
  'AuditLog.Read.All',
  'UserAuthenticationMethod.Read.All',
  'Policy.Read.All',
];

/**
 * Microsoft 365 tenant evidence through Microsoft Graph (Entra ID today;
 * Intune and Defender for Endpoint services are declared for later).
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
      ? 'Read-only evidence from a Microsoft 365 GCC High tenant (Entra ID users, privileged roles, MFA, Conditional Access) for NIST SP 800-171. ITAR / foreign military sales tenants only.'
      : 'Read-only evidence from a Microsoft 365 or GCC tenant (Entra ID users, privileged roles, MFA registration, Conditional Access, inactive accounts) mapped to NIST SP 800-171 assessment objectives.',
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

The person who clicks Connect signs in with a work account in the client tenant. Graph returns only what that account may read, so use an account holding **Global Reader** plus **Security Reader** (or a Global Administrator for the one-time consent). All calls are read-only.

### Licensing

The MFA registration report and sign-in activity need **Entra ID P1** (included in Microsoft 365 G3/G5, E3/E5, Business Premium). Without it those two checks report "could not verify" with the reason; the directory and Conditional Access checks still run.${isGov ? '\n\n### GCC High\n\nThis manifest uses `login.microsoftonline.us` and `graph.microsoft.us`. CMMC Level 2 requires GCC, not GCC High; GCC High applies only to contracts with ITAR / foreign military sales.' : '\n\n### GCC\n\nGCC tenants use the commercial sign-in and Graph endpoints, so this manifest covers both commercial and GCC. GCC High has its own entry.'}`,
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
        description: 'Device compliance and configuration (3.4.x)',
        enabledByDefault: false,
        implemented: false,
      },
      {
        id: 'defender-endpoint',
        name: 'Defender for Endpoint',
        description: 'Endpoint protection status (3.14.x)',
        enabledByDefault: false,
        implemented: false,
      },
    ],

    variables: [includeGuestsVariable, includeDisabledVariable, inactiveDaysVariable],

    checks: [
      usersIdentifiedCheck,
      privilegedAccountsIdentifiedCheck,
      privilegedAccountsForMfaCheck,
      mfaAllUsersCheck,
      mfaPrivilegedUsersCheck,
      conditionalAccessMfaCheck,
      inactiveAccountsCheck,
    ],
  };
}

export const microsoft365Manifest = createMicrosoft365Manifest('commercial');
export const microsoft365GccHighManifest = createMicrosoft365Manifest('gcc-high');

export { MICROSOFT_CLOUDS, PRIVILEGED_ROLE_TEMPLATES } from './graph';
export type { MicrosoftCloud } from './graph';
export * from './types';
