import type { CheckContext } from '../../../types';
import { PRIVILEGED_ROLE_TEMPLATES, graphListAll, graphListAllOrFail } from '../graph';
import type { GraphDirectoryObject, GraphDirectoryRole, GraphUser } from '../types';
import type { Microsoft365CheckOptions } from '../variables';

const USER_FIELDS = 'id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime';

export function isGuest(user: { userType?: string | null }): boolean {
  return (user.userType ?? '').toLowerCase() === 'guest';
}

/** Apply the connection's guest / disabled options. */
export function inScope<T extends { userType?: string | null; accountEnabled?: boolean }>(
  users: T[],
  opts: Microsoft365CheckOptions,
): T[] {
  return users.filter(
    (u) =>
      (opts.includeGuests || !isGuest(u)) && (opts.includeDisabled || u.accountEnabled !== false),
  );
}

/**
 * All users in the tenant. `withSignInActivity` adds the last sign-in
 * timestamps, which needs AuditLog.Read.All and an Entra ID P1 licence.
 */
export async function listUsers(
  ctx: CheckContext,
  opts: { withSignInActivity?: boolean; permission?: string } = {},
): Promise<GraphUser[] | null> {
  const select = opts.withSignInActivity ? `${USER_FIELDS},signInActivity` : USER_FIELDS;
  return graphListAllOrFail<GraphUser>(ctx, '/v1.0/users', {
    what: 'the user directory',
    resourceType: 'tenant',
    permission: opts.permission ?? 'User.Read.All',
    params: { $select: select, $top: '999' },
  });
}

export interface PrivilegedUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  accountEnabled: boolean;
  userType: string | null;
  roles: string[];
}

/**
 * Users holding an activated privileged directory role (direct members).
 * PIM-eligible assignments and role-assignable groups are not expanded here.
 */
export async function listPrivilegedUsers(ctx: CheckContext): Promise<PrivilegedUser[] | null> {
  const roles = await graphListAllOrFail<GraphDirectoryRole>(ctx, '/v1.0/directoryRoles', {
    what: 'directory roles',
    resourceType: 'tenant',
    permission: 'Directory.Read.All',
  });
  if (!roles) return null;

  const privileged = roles.filter((r) => PRIVILEGED_ROLE_TEMPLATES[r.roleTemplateId]);
  ctx.log(`Found ${privileged.length} activated privileged roles of ${roles.length}`);

  const byUser = new Map<string, PrivilegedUser>();
  for (const role of privileged) {
    const roleName = PRIVILEGED_ROLE_TEMPLATES[role.roleTemplateId] ?? role.displayName;
    let members: GraphDirectoryObject[];
    try {
      members = await graphListAll<GraphDirectoryObject>(
        ctx,
        `/v1.0/directoryRoles/${role.id}/members`,
      );
    } catch (err) {
      ctx.warn(`Could not list members of ${roleName}`, { error: String(err) });
      continue;
    }
    for (const m of members) {
      if (m['@odata.type'] !== '#microsoft.graph.user') continue;
      const existing = byUser.get(m.id);
      if (existing) {
        existing.roles.push(roleName);
      } else {
        byUser.set(m.id, {
          id: m.id,
          displayName: m.displayName ?? '',
          userPrincipalName: m.userPrincipalName ?? m.id,
          accountEnabled: m.accountEnabled !== false,
          userType: m.userType ?? null,
          roles: [roleName],
        });
      }
    }
  }
  for (const u of byUser.values()) u.roles.sort();
  return [...byUser.values()].sort((a, b) =>
    a.userPrincipalName.localeCompare(b.userPrincipalName),
  );
}
