import { db } from '@db';
import { APIError } from 'better-auth/api';

/** Shortest password accepted; length is the control, not composition rules. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** How recently the user must have signed in to set or replace a password. */
export const FRESH_SESSION_MS = 30 * 60 * 1000;

export const PASSWORD_NEEDS_AUTHENTICATOR =
  'Sign-in is not set up for this account. Ask your BNI administrator for a setup link, then set a password and an authenticator app.';

/**
 * Password sign-in is allowed only for an account with a confirmed authenticator app,
 * so a password is never the only factor. The same refusal is returned for an unknown
 * email, so the answer does not reveal which accounts exist.
 */
export async function assertPasswordSignInAllowed(email: unknown): Promise<void> {
  const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const user = address
    ? await db.user.findFirst({
        where: { email: { equals: address, mode: 'insensitive' } },
        select: { twoFactorEnabled: true },
      })
    : null;
  if (!user?.twoFactorEnabled) {
    throw new APIError('FORBIDDEN', { message: PASSWORD_NEEDS_AUTHENTICATOR });
  }
}
