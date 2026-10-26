import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import {
  includeDisabledVariable,
  includeGuestsVariable,
  parseMicrosoft365Options,
} from '../variables';
import { inScope, isGuest, listUsers } from './shared';

/**
 * 3.1.1[a] Authorized users are identified.
 * The Entra ID user directory is the authoritative list; each enabled account
 * is recorded as evidence. Guests are listed separately so they are visible.
 */
export const usersIdentifiedCheck: IntegrationCheck = {
  id: 'entra-users-identified',
  name: 'Authorized users identified (Entra ID directory)',
  description:
    'Records every enabled account in Entra ID as the list of authorized users for 3.1.1[a], and flags guest accounts for review.',
  service: 'identity',
  taskMapping: TASK_TEMPLATES['3.1.1[a]'],
  defaultSeverity: 'low',
  variables: [includeGuestsVariable, includeDisabledVariable],

  run: async (ctx) => {
    const opts = parseMicrosoft365Options(ctx.variables);
    const users = await listUsers(ctx);
    if (!users) return;

    const members = inScope(users, { ...opts, includeGuests: false });
    const guests = users.filter(
      (u) => isGuest(u) && (opts.includeDisabled || u.accountEnabled !== false),
    );
    ctx.log(
      `Users: ${users.length} total, ${members.length} members in scope, ${guests.length} guests`,
    );

    if (members.length === 0) {
      ctx.fail({
        title: 'No enabled user accounts found',
        description:
          'The directory returned no enabled member accounts, so the authorized user list is empty.',
        resourceType: 'tenant',
        resourceId: 'tenant',
        severity: 'medium',
        remediation:
          'Confirm the connection was authorized in the right tenant and has User.Read.All.',
      });
      return;
    }

    for (const u of members) {
      ctx.pass({
        title: `Authorized user: ${u.userPrincipalName}`,
        description: `${u.displayName ?? u.userPrincipalName} is an enabled member account in Entra ID.`,
        resourceType: 'user',
        resourceId: u.userPrincipalName,
        evidence: {
          id: u.id,
          displayName: u.displayName,
          userPrincipalName: u.userPrincipalName,
          mail: u.mail,
          accountEnabled: u.accountEnabled,
          userType: u.userType,
          createdDateTime: u.createdDateTime,
        },
      });
    }

    for (const g of guests) {
      const finding = {
        title: `Guest account: ${g.userPrincipalName}`,
        description: `${g.displayName ?? g.userPrincipalName} is a guest (B2B) account. Guests must be on the authorized user list or removed.`,
        resourceType: 'user',
        resourceId: g.userPrincipalName,
        evidence: {
          id: g.id,
          displayName: g.displayName,
          userPrincipalName: g.userPrincipalName,
          accountEnabled: g.accountEnabled,
          userType: g.userType,
          createdDateTime: g.createdDateTime,
        },
      };
      if (opts.includeGuests) {
        ctx.pass(finding);
      } else {
        ctx.fail({
          ...finding,
          severity: 'low',
          remediation:
            'Record the guest on the authorized user list with its business justification, or remove the guest. Turn on "Include guest accounts" once guests are authorized.',
        });
      }
    }
  },
};
