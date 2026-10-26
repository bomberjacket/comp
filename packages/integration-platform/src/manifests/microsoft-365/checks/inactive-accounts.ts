import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import { daysSince } from '../graph';
import {
  inactiveDaysVariable,
  includeDisabledVariable,
  includeGuestsVariable,
  parseMicrosoft365Options,
} from '../variables';
import { inScope, listUsers } from './shared';

/** 3.5.6[b] Identifiers are disabled after the defined period of inactivity. */
export const inactiveAccountsCheck: IntegrationCheck = {
  id: 'entra-inactive-accounts',
  name: 'Inactive accounts disabled',
  description:
    'Compares each enabled account’s last sign-in (interactive or non-interactive) with the inactivity period from your access control policy. Evidence for 3.5.6[b]. Needs AuditLog.Read.All and Entra ID P1.',
  service: 'account-lifecycle',
  taskMapping: TASK_TEMPLATES['3.5.6[b]'],
  defaultSeverity: 'medium',
  variables: [inactiveDaysVariable, includeGuestsVariable, includeDisabledVariable],

  run: async (ctx) => {
    const opts = parseMicrosoft365Options(ctx.variables);
    const users = await listUsers(ctx, {
      withSignInActivity: true,
      permission: 'AuditLog.Read.All (requires Entra ID P1 or P2)',
    });
    if (!users) return;

    const now = Date.now();
    const scoped = inScope(users, { ...opts, includeDisabled: false });
    ctx.log(
      `Inactivity check: ${scoped.length} enabled accounts, threshold ${opts.inactiveDays} days`,
    );

    for (const u of scoped) {
      const interactive = u.signInActivity?.lastSignInDateTime ?? null;
      const nonInteractive = u.signInActivity?.lastNonInteractiveSignInDateTime ?? null;
      const candidates = [interactive, nonInteractive].filter((d): d is string => !!d);
      const lastSignIn = candidates.length ? candidates.sort().at(-1)! : null;
      const idleDays = daysSince(lastSignIn ?? u.createdDateTime, now);
      const evidence = {
        id: u.id,
        displayName: u.displayName,
        userPrincipalName: u.userPrincipalName,
        userType: u.userType,
        lastInteractiveSignIn: interactive,
        lastNonInteractiveSignIn: nonInteractive,
        createdDateTime: u.createdDateTime ?? null,
        idleDays,
        thresholdDays: opts.inactiveDays,
      };

      if (idleDays !== null && idleDays > opts.inactiveDays) {
        ctx.fail({
          title: `Inactive but enabled: ${u.userPrincipalName}`,
          description: lastSignIn
            ? `${u.displayName ?? u.userPrincipalName} last signed in ${idleDays} days ago and is still enabled.`
            : `${u.displayName ?? u.userPrincipalName} has never signed in, was created ${idleDays} days ago, and is still enabled.`,
          resourceType: 'user',
          resourceId: u.userPrincipalName,
          severity: 'medium',
          remediation: `Disable the account (or document why it stays active) in line with the ${opts.inactiveDays}-day inactivity rule in the access control policy.`,
          evidence,
        });
      } else {
        ctx.pass({
          title: `Active within ${opts.inactiveDays} days: ${u.userPrincipalName}`,
          description:
            idleDays === null
              ? `${u.displayName ?? u.userPrincipalName} has no sign-in timestamp and no creation date; nothing to measure.`
              : `${u.displayName ?? u.userPrincipalName} last signed in ${idleDays} days ago.`,
          resourceType: 'user',
          resourceId: u.userPrincipalName,
          evidence,
        });
      }
    }
  },
};
