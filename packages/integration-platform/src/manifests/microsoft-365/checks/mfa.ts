import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { graphListAllOrFail } from '../graph';
import type { GraphConditionalAccessPolicy, GraphUserRegistrationDetails } from '../types';
import {
  includeDisabledVariable,
  includeGuestsVariable,
  parseMicrosoft365Options,
} from '../variables';
import { listPrivilegedUsers, listUsers } from './shared';

const REGISTRATION_REPORT = '/v1.0/reports/authenticationMethods/userRegistrationDetails';
const REGISTRATION_PERMISSION = 'AuditLog.Read.All (requires Entra ID P1 or P2)';

const PHISHING_RESISTANT = new Set([
  'passKeyDeviceBound',
  'passKeyDeviceBoundAuthenticator',
  'passKeyDeviceBoundWindowsHello',
  'windowsHelloForBusiness',
  'fido2SecurityKey',
  'microsoftAuthenticatorPasswordless',
  'x509Certificate',
  'x509CertificateMultiFactor',
]);

function registrationEvidence(r: GraphUserRegistrationDetails) {
  const methods = r.methodsRegistered ?? [];
  return {
    id: r.id,
    userPrincipalName: r.userPrincipalName,
    displayName: r.userDisplayName,
    isAdmin: r.isAdmin ?? false,
    isMfaRegistered: r.isMfaRegistered,
    isMfaCapable: r.isMfaCapable ?? null,
    isPasswordlessCapable: r.isPasswordlessCapable ?? null,
    methodsRegistered: methods,
    phishingResistant: methods.some((m) => PHISHING_RESISTANT.has(m)),
    defaultMfaMethod: r.defaultMfaMethod ?? null,
    lastUpdatedDateTime: r.lastUpdatedDateTime ?? null,
  };
}

async function loadRegistrations(
  ctx: CheckContext,
): Promise<GraphUserRegistrationDetails[] | null> {
  return graphListAllOrFail<GraphUserRegistrationDetails>(ctx, REGISTRATION_REPORT, {
    what: 'MFA registration details',
    resourceType: 'tenant',
    permission: REGISTRATION_PERMISSION,
    params: { $top: '999' },
  });
}

function reportMfa(
  ctx: CheckContext,
  users: GraphUserRegistrationDetails[],
  severityWhenMissing: 'high' | 'critical',
  scope: string,
): void {
  for (const r of users) {
    const evidence = registrationEvidence(r);
    if (r.isMfaRegistered) {
      ctx.pass({
        title: `MFA registered: ${r.userPrincipalName}`,
        description: `${r.userDisplayName ?? r.userPrincipalName} has multifactor authentication registered (${evidence.methodsRegistered.join(', ') || 'methods not listed'}).`,
        resourceType: 'user',
        resourceId: r.userPrincipalName,
        evidence,
      });
    } else {
      ctx.fail({
        title: `MFA not registered: ${r.userPrincipalName}`,
        description: `${r.userDisplayName ?? r.userPrincipalName} (${scope}) has no multifactor authentication method registered.`,
        resourceType: 'user',
        resourceId: r.userPrincipalName,
        severity: r.isAdmin ? 'critical' : severityWhenMissing,
        remediation:
          'Require registration through a Conditional Access policy or the registration campaign, then confirm the user has enrolled Microsoft Authenticator, a FIDO2 key or Windows Hello for Business.',
        evidence,
      });
    }
  }
}

/** 3.5.3[d] MFA for network access to non-privileged accounts: every in-scope user is registered. */
export const mfaAllUsersCheck: IntegrationCheck = {
  id: 'entra-mfa-registration',
  name: 'MFA registered for all users',
  description:
    'Reads the Entra ID authentication-methods registration report and records, per user, whether multifactor authentication is registered. Evidence for 3.5.3[d].',
  service: 'mfa',
  taskMapping: TASK_TEMPLATES['3.5.3[d]'],
  defaultSeverity: 'high',
  variables: [includeGuestsVariable, includeDisabledVariable],

  run: async (ctx) => {
    const opts = parseMicrosoft365Options(ctx.variables);
    const [registrations, users] = await Promise.all([loadRegistrations(ctx), listUsers(ctx)]);
    if (!registrations || !users) return;

    const enabledById = new Map(users.map((u) => [u.id, u.accountEnabled !== false]));
    const inScope = registrations.filter((r) => {
      if (!opts.includeGuests && (r.userType ?? '').toLowerCase() === 'guest') return false;
      if (!opts.includeDisabled && enabledById.get(r.id) === false) return false;
      return true;
    });
    ctx.log(`MFA registration: ${inScope.length} users in scope of ${registrations.length}`);
    reportMfa(ctx, inScope, 'high', 'user');
  },
};

/** 3.5.3[c] MFA for network access to privileged accounts: every privileged user is registered. */
export const mfaPrivilegedUsersCheck: IntegrationCheck = {
  id: 'entra-mfa-privileged',
  name: 'MFA registered for privileged accounts',
  description:
    'Cross-references the privileged directory role members with the registration report. Evidence for 3.5.3[c]; records whether a phishing-resistant method is registered.',
  service: 'mfa',
  taskMapping: TASK_TEMPLATES['3.5.3[c]'],
  defaultSeverity: 'critical',

  run: async (ctx) => {
    const [registrations, privileged] = await Promise.all([
      loadRegistrations(ctx),
      listPrivilegedUsers(ctx),
    ]);
    if (!registrations || !privileged) return;

    const byId = new Map(registrations.map((r) => [r.id, r]));
    const matched: GraphUserRegistrationDetails[] = [];
    for (const p of privileged) {
      const r = byId.get(p.id);
      if (r) {
        matched.push({ ...r, isAdmin: true });
      } else {
        ctx.fail({
          title: `No registration record: ${p.userPrincipalName}`,
          description: `${p.displayName || p.userPrincipalName} holds ${p.roles.join(', ')} but is missing from the registration report, so MFA cannot be confirmed.`,
          resourceType: 'user',
          resourceId: p.userPrincipalName,
          severity: 'high',
          remediation:
            'Re-run after the report refreshes (it lags by up to a day). If the account persists as missing, check it in Entra ID directly.',
          evidence: { id: p.id, roles: p.roles },
        });
      }
    }
    ctx.log(`Privileged users with registration data: ${matched.length} of ${privileged.length}`);
    reportMfa(ctx, matched, 'critical', 'privileged');
  },
};

/** A policy counts as enforcing MFA for everyone when it is on, targets all users and all apps, and grants require MFA or an authentication strength. */
export function policyEnforcesMfaForAll(p: GraphConditionalAccessPolicy): boolean {
  if (p.state !== 'enabled') return false;
  const users = p.conditions?.users ?? {};
  const apps = p.conditions?.applications ?? {};
  const grants = p.grantControls ?? null;
  const requiresMfa =
    !!grants && ((grants.builtInControls ?? []).includes('mfa') || !!grants.authenticationStrength);
  return (
    requiresMfa &&
    (users.includeUsers ?? []).includes('All') &&
    (apps.includeApplications ?? []).includes('All')
  );
}

/** 3.5.3[d] enforcement: a Conditional Access policy requires MFA for all users on all apps. */
export const conditionalAccessMfaCheck: IntegrationCheck = {
  id: 'entra-conditional-access-mfa',
  name: 'Conditional Access requires MFA for all users',
  description:
    'Finds enabled Conditional Access policies that require multifactor authentication (or an authentication strength) for all users on all cloud apps. Evidence that 3.5.3[d] is enforced, not just registered.',
  service: 'mfa',
  taskMapping: TASK_TEMPLATES['3.5.3[d]'],
  defaultSeverity: 'high',

  run: async (ctx) => {
    const policies = await graphListAllOrFail<GraphConditionalAccessPolicy>(
      ctx,
      '/v1.0/identity/conditionalAccess/policies',
      {
        what: 'Conditional Access policies',
        resourceType: 'tenant',
        permission: 'Policy.Read.All',
      },
    );
    if (!policies) return;

    const enforcing = policies.filter(policyEnforcesMfaForAll);
    const reportOnly = policies.filter(
      (p) =>
        p.state === 'enabledForReportingButNotEnforced' &&
        (p.grantControls?.builtInControls ?? []).includes('mfa'),
    );
    ctx.log(
      `Conditional Access: ${policies.length} policies, ${enforcing.length} enforce MFA for all users`,
    );

    for (const p of enforcing) {
      ctx.pass({
        title: `MFA enforced by policy: ${p.displayName}`,
        description: `"${p.displayName}" is enabled, targets all users and all cloud apps, and requires ${p.grantControls?.authenticationStrength ? `authentication strength "${p.grantControls.authenticationStrength.displayName ?? p.grantControls.authenticationStrength.id}"` : 'multifactor authentication'}.`,
        resourceType: 'conditional-access-policy',
        resourceId: p.id,
        evidence: {
          id: p.id,
          displayName: p.displayName,
          state: p.state,
          excludeUsers: p.conditions?.users?.excludeUsers ?? [],
          excludeGroups: p.conditions?.users?.excludeGroups ?? [],
          excludeRoles: p.conditions?.users?.excludeRoles ?? [],
          excludeApplications: p.conditions?.applications?.excludeApplications ?? [],
          builtInControls: p.grantControls?.builtInControls ?? [],
          authenticationStrength: p.grantControls?.authenticationStrength ?? null,
        },
      });
    }

    if (enforcing.length === 0) {
      ctx.fail({
        title: 'No Conditional Access policy requires MFA for all users',
        description:
          reportOnly.length > 0
            ? `${reportOnly.length} MFA policy(ies) exist in report-only mode but none is enforced for all users on all apps.`
            : 'No enabled policy targets all users and all cloud apps with an MFA grant control.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        severity: 'high',
        remediation:
          'Create (or switch to "On") a Conditional Access policy: users = All, cloud apps = All, grant = Require multifactor authentication or an authentication strength. Keep a break-glass account excluded and documented.',
        evidence: {
          policies: policies.map((p) => ({ id: p.id, displayName: p.displayName, state: p.state })),
          reportOnlyMfaPolicies: reportOnly.map((p) => p.displayName),
        },
      });
    }
  },
};
