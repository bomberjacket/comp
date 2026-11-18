import {
  emailOTPClient,
  multiSessionClient,
  organizationClient,
  twoFactorClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ac, allRoles } from '@trycompai/auth';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
  plugins: [
    organizationClient({ ac, roles: allRoles }),
    emailOTPClient(),
    multiSessionClient(),
    twoFactorClient(),
  ],
});

export const {
  signIn,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
  useListOrganizations,
  useActiveMember,
} = authClient;
