import { auth } from '@/utils/auth';
import { getSafeRedirectPath } from '@/utils/auth-callback';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SetupSignIn } from './SetupSignIn';

export const metadata: Metadata = { title: 'Set up sign-in' };

/**
 * Where a BNI administrator's one-time setup link lands. The session it opens can do
 * nothing except set a password and an authenticator app; once both are confirmed the
 * person continues into the app (or to their invitation).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next } = await searchParams;
  const target = getSafeRedirectPath(next) ?? '/';
  const session = await auth.api.getSession({ headers: await headers() });
  const ready = (session?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled === true;
  if (session && ready) redirect(target);

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6 pt-12">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your sign-in</h1>
        {session ? (
          <>
            <p className="text-sm text-muted-foreground">
              Signed in as {session.user.email}. Set a password and connect an authenticator app. You need both before you can use the
              system; from then on you sign in with your password and a code from the app.
            </p>
            <SetupSignIn target={target} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This setup link has expired or was already used. Ask your BNI administrator to send a new one. If you already finished setup,{' '}
            <Link href="/auth" className="underline">
              sign in
            </Link>{' '}
            with your password and authenticator code.
          </p>
        )}
      </main>
    </div>
  );
}
