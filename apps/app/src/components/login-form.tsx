'use client';

import { GithubSignIn } from '@/components/github-sign-in';
import { GoogleSignIn } from '@/components/google-sign-in';
import { MicrosoftSignIn } from '@/components/microsoft-sign-in';
import { PasswordSignIn } from '@/components/password-sign-in';

interface LoginFormProps {
  inviteCode?: string;
  redirectTo?: string;
  showGoogle: boolean;
  showGithub: boolean;
  showMicrosoft: boolean;
}

/**
 * BNI: sign-in is password plus authenticator code. Emailed links and codes are off,
 * and a new account is opened only by a BNI administrator's setup link. The provider
 * buttons appear only when their keys are configured on the server.
 */
export function LoginForm({ inviteCode, redirectTo, showGoogle, showGithub, showMicrosoft }: LoginFormProps) {
  return (
    <div className="space-y-4">
      <PasswordSignIn inviteCode={inviteCode} redirectTo={redirectTo} />
      {showGoogle && <GoogleSignIn inviteCode={inviteCode} redirectTo={redirectTo} />}
      {showMicrosoft && <MicrosoftSignIn inviteCode={inviteCode} redirectTo={redirectTo} />}
      {showGithub && <GithubSignIn inviteCode={inviteCode} redirectTo={redirectTo} />}
    </div>
  );
}
