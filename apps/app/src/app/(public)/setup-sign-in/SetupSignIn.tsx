'use client';

import { PasswordSignInSettings } from '@/app/(app)/[orgId]/settings/user/components/PasswordSignInSettings';

/** The password and authenticator steps; a full page load afterwards picks up the new session. */
export function SetupSignIn({ target }: { target: string }) {
  return (
    <PasswordSignInSettings
      onReady={() => {
        window.location.href = target;
      }}
    />
  );
}
