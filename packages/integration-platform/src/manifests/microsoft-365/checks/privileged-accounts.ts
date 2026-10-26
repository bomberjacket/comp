import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { isGuest, listPrivilegedUsers } from './shared';

/** More Global Administrators than this is flagged (Microsoft guidance: fewer than five). */
const MAX_GLOBAL_ADMINS = 5;

async function runPrivilegedAccounts(ctx: CheckContext): Promise<void> {
  const privileged = await listPrivilegedUsers(ctx);
  if (!privileged) return;
  ctx.log(`Privileged accounts: ${privileged.length}`);

  if (privileged.length === 0) {
    ctx.fail({
      title: 'No privileged accounts found',
      description:
        'No user holds an activated privileged directory role. Every tenant has at least one Global Administrator, so the read is incomplete.',
      resourceType: 'tenant',
      resourceId: 'tenant',
      severity: 'medium',
      remediation: 'Grant Directory.Read.All and re-run the check.',
    });
    return;
  }

  for (const u of privileged) {
    const evidence = {
      id: u.id,
      displayName: u.displayName,
      userPrincipalName: u.userPrincipalName,
      accountEnabled: u.accountEnabled,
      userType: u.userType,
      roles: u.roles,
    };
    if (isGuest(u)) {
      ctx.fail({
        title: `Guest holds privileged role: ${u.userPrincipalName}`,
        description: `${u.displayName || u.userPrincipalName} is a guest account with ${u.roles.join(', ')}.`,
        resourceType: 'user',
        resourceId: u.userPrincipalName,
        severity: 'high',
        remediation:
          'Privileged roles belong on member accounts owned by the organization. Remove the role from the guest or convert the account.',
        evidence,
      });
      continue;
    }
    ctx.pass({
      title: `Privileged account: ${u.userPrincipalName}`,
      description: `${u.displayName || u.userPrincipalName} holds ${u.roles.join(', ')}.`,
      resourceType: 'user',
      resourceId: u.userPrincipalName,
      evidence,
    });
  }

  const globalAdmins = privileged.filter((u) => u.roles.includes('Global Administrator'));
  if (globalAdmins.length > MAX_GLOBAL_ADMINS) {
    ctx.fail({
      title: `${globalAdmins.length} Global Administrators`,
      description: `${globalAdmins.length} accounts hold Global Administrator; Microsoft recommends fewer than ${MAX_GLOBAL_ADMINS}.`,
      resourceType: 'tenant',
      resourceId: 'tenant',
      severity: 'medium',
      remediation:
        'Move day-to-day administration to least-privilege roles and keep Global Administrator for break-glass and a small number of named admins.',
      evidence: { globalAdministrators: globalAdmins.map((u) => u.userPrincipalName) },
    });
  }
}

const description =
  'Lists every user holding an activated privileged Entra ID directory role (Global Administrator, User Administrator, Security Administrator, ...). PIM-eligible assignments are not expanded.';

/** 3.1.5[a] Privileged accounts are identified. */
export const privilegedAccountsIdentifiedCheck: IntegrationCheck = {
  id: 'entra-privileged-accounts',
  name: 'Privileged accounts identified (3.1.5)',
  description,
  service: 'identity',
  taskMapping: TASK_TEMPLATES['3.1.5[a]'],
  defaultSeverity: 'medium',
  run: runPrivilegedAccounts,
};

/** 3.5.3[a] Privileged accounts are identified (same evidence, MFA family). */
export const privilegedAccountsForMfaCheck: IntegrationCheck = {
  id: 'entra-privileged-accounts-mfa',
  name: 'Privileged accounts identified (3.5.3)',
  description,
  service: 'mfa',
  taskMapping: TASK_TEMPLATES['3.5.3[a]'],
  defaultSeverity: 'medium',
  run: runPrivilegedAccounts,
};
