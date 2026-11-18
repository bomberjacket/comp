import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface AuthMeResponse {
  pendingInvitation: { id: string } | null;
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const session = await auth.api.getSession({
    headers: hdrs,
  });

  if (!session) {
    return redirect('/auth');
  }

  // BNI: a session without a confirmed authenticator app (opened by a setup link) can
  // only finish setup; the API refuses it everywhere else. Impersonation is exempt.
  const setupPending =
    (session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled !== true &&
    !(session.session as { impersonatedBy?: string | null }).impersonatedBy;
  if (setupPending) {
    return redirect('/setup-sign-in');
  }

  const meRes = await serverApi.get<AuthMeResponse>('/v1/auth/me');
  const pendingInvite = meRes.data?.pendingInvitation;

  if (pendingInvite) {
    let path = hdrs.get('x-pathname') || hdrs.get('referer') || '';
    path = path.replace(/\/([a-z]{2})\//, '/');
    const target = `/invite/${pendingInvite.id}`;
    if (!path.startsWith(target)) {
      return redirect(target);
    }
  }

  return <>{children}</>;
}
