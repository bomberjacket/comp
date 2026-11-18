import { db } from '@db';
import { asAdminIssuedLink, SETUP_PAGE_PATH } from './setup-link-context';

const appUrl = (): string =>
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export interface SetupLinkResult {
  email: string;
  userId: string;
  created: boolean;
}

/**
 * Emails a one-time setup link. Only code paths a BNI platform admin drives may call this
 * (the admin endpoints, an invite made by a platform admin, the start-up bootstrap).
 *
 * `next` is an app path to continue to after setup, such as /invite/<id>.
 * `createUser` makes the account when the address has none yet (an invited person).
 * `resetAuthenticator` clears a lost authenticator and ends every session first.
 */
export async function sendSetupLink(params: {
  email: string;
  next?: string;
  createUser?: boolean;
  resetAuthenticator?: boolean;
}): Promise<SetupLinkResult | null> {
  const email = params.email.trim().toLowerCase();
  let user = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  let created = false;
  if (!user) {
    if (!params.createUser) return null;
    user = await db.user.create({
      data: { email, emailVerified: true, name: email.split('@')[0] },
      select: { id: true, email: true },
    });
    created = true;
  }

  if (params.resetAuthenticator) {
    await db.$transaction([
      db.twoFactor.deleteMany({ where: { userId: user.id } }),
      db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } }),
      db.session.deleteMany({ where: { userId: user.id } }),
    ]);
  }

  const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : undefined;
  const callbackURL = `${appUrl()}${SETUP_PAGE_PATH}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  // Loaded on use so that importing this helper does not pull in the auth server.
  const { auth } = await import('./auth.server.js');
  await asAdminIssuedLink(() =>
    auth.api.signInMagicLink({ body: { email: user.email, callbackURL }, headers: new Headers() }),
  );
  return { email: user.email, userId: user.id, created };
}
