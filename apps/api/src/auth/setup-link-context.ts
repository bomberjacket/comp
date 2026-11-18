import { AsyncLocalStorage } from 'node:async_hooks';
import { SetMetadata } from '@nestjs/common';

/**
 * BNI sign-in policy. Nobody signs in by an emailed link or code, and nobody creates
 * their own account. A person gets in only when a BNI platform admin sends a one-time
 * setup link; that link opens a short session that can do nothing but set a password and
 * an authenticator app. Everyday sign-in is then password plus authenticator code.
 */

/** How long an admin-issued setup link stays valid. */
export const SETUP_LINK_EXPIRES_IN_SECONDS = 24 * 60 * 60;

/** How long the session opened by a setup link lasts while the authenticator is not confirmed. */
export const SETUP_SESSION_MS = 60 * 60 * 1000;

/** App page a setup link lands on. */
export const SETUP_PAGE_PATH = '/setup-sign-in';

export const SETUP_REQUIRED_CODE = 'SIGN_IN_SETUP_REQUIRED';
export const SETUP_REQUIRED_MESSAGE =
  'Finish setting up sign-in first: set a password and an authenticator app.';
export const EMAIL_SIGN_IN_OFF_MESSAGE =
  'Sign-in by emailed link or code is switched off. Sign in with your password and authenticator code, or ask your BNI administrator for a setup link.';
export const SELF_SIGN_UP_OFF_MESSAGE = 'Accounts are created by a BNI administrator.';

const issuing = new AsyncLocalStorage<true>();

/** Runs `fn` as an admin-issued setup link; only inside it may a sign-in link be sent. */
export const asAdminIssuedLink = <T>(fn: () => Promise<T>): Promise<T> => issuing.run(true, fn);
export const isAdminIssuedLink = (): boolean => issuing.getStore() === true;

/** Paths of better-auth that sign in, sign up or reset a password through the mailbox. */
export function isEmailSignInPath(path: string): boolean {
  return (
    path === '/sign-in/magic-link' ||
    path === '/sign-in/email-otp' ||
    path.startsWith('/email-otp/') ||
    path.startsWith('/forget-password/') ||
    path === '/request-password-reset' ||
    path === '/reset-password'
  );
}

/** Marks a route a signed-in user may call before their authenticator is confirmed. */
export const ALLOW_SETUP_PENDING_KEY = 'allowSetupPending';
export const AllowSetupPending = () => SetMetadata(ALLOW_SETUP_PENDING_KEY, true);
