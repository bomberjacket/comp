import { describe, expect, it } from 'bun:test';
import { TASK_TEMPLATES } from '../../../task-mappings';
import {
  conditionalAccessMfaCheck,
  inactiveAccountsCheck,
  mfaAllUsersCheck,
  mfaPrivilegedUsersCheck,
  privilegedAccountsIdentifiedCheck,
  usersIdentifiedCheck,
} from '../checks';
import { policyEnforcesMfaForAll } from '../checks/mfa';
import {
  createMicrosoft365Manifest,
  microsoft365GccHighManifest,
  microsoft365Manifest,
} from '../index';
import type {
  GraphConditionalAccessPolicy,
  GraphUser,
  GraphUserRegistrationDetails,
} from '../types';
import { DAY, denied, makeCtx } from './test-context';

const GLOBAL_ADMIN_TEMPLATE = '62e90394-69f5-4237-9190-012177145e10';

const user = (overrides: Partial<GraphUser> & { userPrincipalName: string }): GraphUser => ({
  id: `id-${overrides.userPrincipalName}`,
  displayName: overrides.userPrincipalName.split('@')[0],
  accountEnabled: true,
  userType: 'Member',
  createdDateTime: new Date(Date.now() - 400 * DAY).toISOString(),
  ...overrides,
});

const registration = (
  overrides: Partial<GraphUserRegistrationDetails> & { userPrincipalName: string },
): GraphUserRegistrationDetails => ({
  id: `id-${overrides.userPrincipalName}`,
  isMfaRegistered: true,
  methodsRegistered: ['microsoftAuthenticatorPush'],
  userType: 'member',
  ...overrides,
});

describe('manifest', () => {
  it('registers two clouds with the right endpoints and eighteen checks', () => {
    expect(microsoft365Manifest.id).toBe('microsoft-365');
    expect(microsoft365Manifest.baseUrl).toBe('https://graph.microsoft.com');
    expect(microsoft365GccHighManifest.id).toBe('microsoft-365-gcc-high');
    expect(microsoft365GccHighManifest.baseUrl).toBe('https://graph.microsoft.us');
    if (microsoft365GccHighManifest.auth.type !== 'oauth2') throw new Error('expected oauth2');
    expect(microsoft365GccHighManifest.auth.config.tokenUrl).toBe(
      'https://login.microsoftonline.us/organizations/oauth2/v2.0/token',
    );
    expect(microsoft365GccHighManifest.auth.config.scopes).toContain(
      'https://graph.microsoft.us/User.Read.All',
    );
    expect(microsoft365Manifest.checks).toHaveLength(18);
    expect(createMicrosoft365Manifest('commercial').checks?.map((c) => c.id)).toEqual(
      microsoft365Manifest.checks?.map((c) => c.id),
    );
  });

  it('maps every check to a NIST SP 800-171 objective task', () => {
    const mapping = Object.fromEntries(
      (microsoft365Manifest.checks ?? []).map((c) => [c.id, c.taskMapping]),
    );
    expect(mapping).toEqual({
      'entra-users-identified': TASK_TEMPLATES['3.1.1[a]'],
      'entra-privileged-accounts': TASK_TEMPLATES['3.1.5[a]'],
      'entra-privileged-accounts-mfa': TASK_TEMPLATES['3.5.3[a]'],
      'entra-mfa-registration': TASK_TEMPLATES['3.5.3[d]'],
      'entra-mfa-privileged': TASK_TEMPLATES['3.5.3[c]'],
      'entra-conditional-access-mfa': TASK_TEMPLATES['3.5.3[d]'],
      'entra-inactive-accounts': TASK_TEMPLATES['3.5.6[b]'],
      'intune-device-inventory': TASK_TEMPLATES['3.4.1[d]'],
      'intune-stale-devices': TASK_TEMPLATES['3.4.1[f]'],
      'intune-compliance-policies': TASK_TEMPLATES['3.4.2[a]'],
      'intune-device-compliance': TASK_TEMPLATES['3.4.2[b]'],
      'intune-device-encryption': TASK_TEMPLATES['3.13.16[a]'],
      'intune-mobile-encryption': TASK_TEMPLATES['3.1.19[b]'],
      'defender-realtime-protection': TASK_TEMPLATES['3.14.2[b]'],
      'defender-realtime-scans': TASK_TEMPLATES['3.14.5[c]'],
      'defender-signatures-current': TASK_TEMPLATES['3.14.4[a]'],
      'defender-periodic-scans': TASK_TEMPLATES['3.14.5[b]'],
      'defender-open-alerts': TASK_TEMPLATES['3.14.6[a]'],
    });
  });
});

describe('usersIdentifiedCheck', () => {
  it('passes each enabled member, flags guests, skips disabled accounts', async () => {
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/users': [
        user({ userPrincipalName: 'alice@shop.com' }),
        user({ userPrincipalName: 'bob@shop.com', accountEnabled: false }),
        user({ userPrincipalName: 'vendor_x#EXT#@shop.com', userType: 'Guest' }),
      ],
    });
    await usersIdentifiedCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['alice@shop.com']);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toContain('Guest account');
    expect(failed[0].severity).toBe('low');
  });

  it('counts guests as authorized when the option is on', async () => {
    const { ctx, passed, failed } = makeCtx(
      {
        '/v1.0/users': [
          user({ userPrincipalName: 'g#EXT#@shop.com', userType: 'Guest' }),
          user({ userPrincipalName: 'a@shop.com' }),
        ],
      },
      { include_guests: true },
    );
    await usersIdentifiedCheck.run(ctx);
    expect(passed).toHaveLength(2);
    expect(failed).toHaveLength(0);
  });

  it('emits one unverified finding when the directory cannot be read', async () => {
    const { ctx, passed, failed } = makeCtx({ '/v1.0/users': denied });
    await usersIdentifiedCheck.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toBe('Could not verify the user directory');
    expect(failed[0].remediation).toContain('User.Read.All');
  });
});

describe('privilegedAccountsIdentifiedCheck', () => {
  const roles = [
    { id: 'role-ga', displayName: 'Global Administrator', roleTemplateId: GLOBAL_ADMIN_TEMPLATE },
    {
      id: 'role-reader',
      displayName: 'Directory Readers',
      roleTemplateId: '88d8e3e3-8f55-4a1e-953a-9b9898b8876b',
    },
  ];
  const member = (upn: string, extra: Record<string, unknown> = {}) => ({
    '@odata.type': '#microsoft.graph.user',
    id: `id-${upn}`,
    displayName: upn,
    userPrincipalName: upn,
    accountEnabled: true,
    userType: 'Member',
    ...extra,
  });

  it('lists users holding privileged roles and ignores non-privileged roles and service principals', async () => {
    const { ctx, passed, failed, calls } = makeCtx({
      '/v1.0/directoryRoles/role-ga/members': [
        member('admin@shop.com'),
        {
          '@odata.type': '#microsoft.graph.servicePrincipal',
          id: 'sp-1',
          displayName: 'automation',
        },
      ],
      '/v1.0/directoryRoles/role-reader/members': [member('reader@shop.com')],
      '/v1.0/directoryRoles': roles,
    });
    await privilegedAccountsIdentifiedCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['admin@shop.com']);
    expect(passed[0].evidence.roles).toEqual(['Global Administrator']);
    expect(failed).toHaveLength(0);
    expect(calls.some((c) => c.includes('role-reader'))).toBe(false);
  });

  it('fails a guest holding a privileged role and too many Global Administrators', async () => {
    const admins = Array.from({ length: 6 }, (_, i) => member(`ga${i}@shop.com`));
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/directoryRoles/role-ga/members': [
        ...admins,
        member('ext#EXT#@shop.com', { userType: 'Guest' }),
      ],
      '/v1.0/directoryRoles': roles,
    });
    await privilegedAccountsIdentifiedCheck.run(ctx);
    expect(passed).toHaveLength(6);
    expect(failed.map((f) => f.title)).toEqual([
      'Guest holds privileged role: ext#EXT#@shop.com',
      '7 Global Administrators',
    ]);
  });
});

describe('MFA checks', () => {
  it('passes registered users, fails unregistered ones, skips guests and disabled accounts', async () => {
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/reports/authenticationMethods/userRegistrationDetails': [
        registration({ userPrincipalName: 'alice@shop.com' }),
        registration({
          userPrincipalName: 'bob@shop.com',
          isMfaRegistered: false,
          methodsRegistered: [],
        }),
        registration({
          userPrincipalName: 'g#EXT#@shop.com',
          isMfaRegistered: false,
          userType: 'guest',
        }),
        registration({ userPrincipalName: 'old@shop.com', isMfaRegistered: false }),
        registration({
          userPrincipalName: 'admin@shop.com',
          isMfaRegistered: false,
          isAdmin: true,
        }),
      ],
      '/v1.0/users': [
        user({ userPrincipalName: 'alice@shop.com' }),
        user({ userPrincipalName: 'bob@shop.com' }),
        user({ userPrincipalName: 'old@shop.com', accountEnabled: false }),
        user({ userPrincipalName: 'admin@shop.com' }),
      ],
    });
    await mfaAllUsersCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['alice@shop.com']);
    expect(failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['bob@shop.com', 'high'],
      ['admin@shop.com', 'critical'],
    ]);
  });

  it('reports the licence/permission problem when the registration report is unavailable', async () => {
    const { ctx, failed } = makeCtx({
      '/v1.0/reports/authenticationMethods/userRegistrationDetails': denied,
      '/v1.0/users': [user({ userPrincipalName: 'alice@shop.com' })],
    });
    await mfaAllUsersCheck.run(ctx);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toBe('Could not verify MFA registration details');
    expect(failed[0].remediation).toContain('Entra ID P1');
  });

  it('cross-references privileged users with the registration report', async () => {
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/reports/authenticationMethods/userRegistrationDetails': [
        registration({ userPrincipalName: 'ga@shop.com', methodsRegistered: ['fido2SecurityKey'] }),
        registration({ userPrincipalName: 'weak@shop.com', isMfaRegistered: false }),
      ],
      '/v1.0/directoryRoles/role-ga/members': [
        {
          '@odata.type': '#microsoft.graph.user',
          id: 'id-ga@shop.com',
          userPrincipalName: 'ga@shop.com',
        },
        {
          '@odata.type': '#microsoft.graph.user',
          id: 'id-weak@shop.com',
          userPrincipalName: 'weak@shop.com',
        },
        {
          '@odata.type': '#microsoft.graph.user',
          id: 'id-new@shop.com',
          userPrincipalName: 'new@shop.com',
        },
      ],
      '/v1.0/directoryRoles': [
        {
          id: 'role-ga',
          displayName: 'Global Administrator',
          roleTemplateId: GLOBAL_ADMIN_TEMPLATE,
        },
      ],
    });
    await mfaPrivilegedUsersCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual(['ga@shop.com']);
    expect(passed[0].evidence.phishingResistant).toBe(true);
    expect(failed.map((f) => [f.resourceId, f.severity])).toEqual([
      ['new@shop.com', 'high'],
      ['weak@shop.com', 'critical'],
    ]);
  });
});

describe('conditionalAccessMfaCheck', () => {
  const policy = (
    overrides: Partial<GraphConditionalAccessPolicy>,
  ): GraphConditionalAccessPolicy => ({
    id: 'p1',
    displayName: 'Require MFA for all users',
    state: 'enabled',
    conditions: {
      users: { includeUsers: ['All'], excludeUsers: ['breakglass-id'] },
      applications: { includeApplications: ['All'] },
    },
    grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    ...overrides,
  });

  it('recognises an all-users, all-apps MFA policy and authentication strengths', () => {
    expect(policyEnforcesMfaForAll(policy({}))).toBe(true);
    expect(
      policyEnforcesMfaForAll(
        policy({
          grantControls: {
            builtInControls: [],
            authenticationStrength: { id: 's1', displayName: 'Phishing-resistant MFA' },
          },
        }),
      ),
    ).toBe(true);
    expect(policyEnforcesMfaForAll(policy({ state: 'enabledForReportingButNotEnforced' }))).toBe(
      false,
    );
    expect(
      policyEnforcesMfaForAll(
        policy({
          conditions: {
            users: { includeUsers: ['some-group'] },
            applications: { includeApplications: ['All'] },
          },
        }),
      ),
    ).toBe(false);
    expect(
      policyEnforcesMfaForAll(
        policy({
          conditions: {
            users: { includeUsers: ['All'] },
            applications: { includeApplications: ['Office365'] },
          },
        }),
      ),
    ).toBe(false);
    expect(
      policyEnforcesMfaForAll(policy({ grantControls: { builtInControls: ['compliantDevice'] } })),
    ).toBe(false);
  });

  it('passes the enforcing policy with its exclusions as evidence', async () => {
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/identity/conditionalAccess/policies': [policy({})],
    });
    await conditionalAccessMfaCheck.run(ctx);
    expect(passed).toHaveLength(1);
    expect(passed[0].evidence.excludeUsers).toEqual(['breakglass-id']);
    expect(failed).toHaveLength(0);
  });

  it('fails when only a report-only MFA policy exists', async () => {
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/identity/conditionalAccess/policies': [
        policy({ state: 'enabledForReportingButNotEnforced' }),
      ],
    });
    await conditionalAccessMfaCheck.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(1);
    expect(failed[0].description).toContain('report-only');
    expect(failed[0].evidence?.reportOnlyMfaPolicies).toEqual(['Require MFA for all users']);
  });
});

describe('inactiveAccountsCheck', () => {
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

  it('fails enabled accounts idle beyond the threshold, using the latest of both sign-in kinds', async () => {
    const { ctx, passed, failed } = makeCtx(
      {
        '/v1.0/users': [
          user({
            userPrincipalName: 'active@shop.com',
            signInActivity: { lastSignInDateTime: ago(5) },
          }),
          user({
            userPrincipalName: 'svc@shop.com',
            signInActivity: {
              lastSignInDateTime: ago(200),
              lastNonInteractiveSignInDateTime: ago(3),
            },
          }),
          user({
            userPrincipalName: 'stale@shop.com',
            signInActivity: { lastSignInDateTime: ago(120) },
          }),
          user({
            userPrincipalName: 'never@shop.com',
            signInActivity: null,
            createdDateTime: ago(100),
          }),
          user({
            userPrincipalName: 'fresh@shop.com',
            signInActivity: null,
            createdDateTime: ago(10),
          }),
          user({
            userPrincipalName: 'off@shop.com',
            accountEnabled: false,
            signInActivity: { lastSignInDateTime: ago(500) },
          }),
        ],
      },
      { inactive_days: 60 },
    );
    await inactiveAccountsCheck.run(ctx);
    expect(passed.map((p) => p.resourceId)).toEqual([
      'active@shop.com',
      'svc@shop.com',
      'fresh@shop.com',
    ]);
    expect(failed.map((f) => f.resourceId)).toEqual(['stale@shop.com', 'never@shop.com']);
    expect(failed[0].evidence?.thresholdDays).toBe(60);
    expect(failed[1].description).toContain('never signed in');
  });

  it('defaults the threshold to 90 days', async () => {
    const { ctx, passed, failed } = makeCtx({
      '/v1.0/users': [
        user({ userPrincipalName: 'u@shop.com', signInActivity: { lastSignInDateTime: ago(80) } }),
      ],
    });
    await inactiveAccountsCheck.run(ctx);
    expect(passed).toHaveLength(1);
    expect(failed).toHaveLength(0);
    expect(passed[0].evidence.thresholdDays).toBe(90);
  });
});
