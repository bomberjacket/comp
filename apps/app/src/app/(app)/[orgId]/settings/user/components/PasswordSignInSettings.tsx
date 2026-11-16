'use client';

import { apiClient } from '@/lib/api-client';
import { authClient } from '@/utils/auth-client';
import { Button, Input, Label, Section, Stack, Text } from '@trycompai/design-system';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

interface Status {
  hasPassword: boolean;
  authenticatorEnabled: boolean;
  passwordSignInReady: boolean;
  sessionFresh: boolean;
  minPasswordLength: number;
}

interface Enrolment {
  totpURI: string;
  backupCodes: string[];
  qr: string;
}

async function fetchStatus(url: string): Promise<Status> {
  const res = await apiClient.get<Status>(url);
  if (res.error || !res.data) throw new Error(res.error ?? 'Could not load');
  return res.data;
}

const secretOf = (uri: string): string => {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
};

/**
 * Password sign-in for the signed-in user, in three steps: set a password, scan the QR
 * code with any authenticator app, confirm with a code. Password sign-in works only
 * once the authenticator is confirmed; email-link sign-in keeps working throughout and
 * is how a forgotten password is replaced.
 */
export function PasswordSignInSettings() {
  const { data: status, mutate } = useSWR<Status>('/v1/auth/password-login', fetchStatus, { revalidateOnFocus: false });
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!status?.hasPassword) setChanging(false);
  }, [status?.hasPassword]);

  if (!status) return null;
  const min = status.minPasswordLength;
  const passwordOk = newPassword.length >= min && newPassword === confirm;
  const showPasswordForm = !status.hasPassword || changing;

  const savePassword = async () => {
    setBusy(true);
    const res = await apiClient.post('/v1/auth/password-login/password', { newPassword });
    setBusy(false);
    if (res.error) return toast.error(res.error);
    setCurrent(newPassword);
    setNewPassword('');
    setConfirm('');
    setChanging(false);
    await mutate();
    toast.success(status.hasPassword ? 'Password replaced' : 'Password set. Now add the authenticator app.');
  };

  const startAuthenticator = async () => {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.enable({ password: current });
    setBusy(false);
    if (error || !data) return toast.error(error?.message || 'The password is not right.');
    setEnrolment({ totpURI: data.totpURI, backupCodes: data.backupCodes, qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }) });
  };

  const confirmAuthenticator = async () => {
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, '') });
    setBusy(false);
    if (error) {
      setCode('');
      return toast.error(error.message || 'That code is not right. Wait for the next one and try again.');
    }
    setCode('');
    setCurrent('');
    await mutate();
    toast.success('Authenticator confirmed. Password sign-in is ready.');
  };

  const turnOff = async () => {
    setBusy(true);
    const { error } = await authClient.twoFactor.disable({ password: current });
    setBusy(false);
    if (error) return toast.error(error.message || 'The password is not right.');
    setCurrent('');
    setEnrolment(null);
    await mutate();
    toast.success('Authenticator removed. Password sign-in is off until you add one again.');
  };

  const description = status.passwordSignInReady
    ? 'Password sign-in is on. Each sign-in asks for your password and a code from your authenticator app.'
    : 'Sign in with a password and a code from an authenticator app, instead of waiting for an email link. The email link keeps working as a fallback.';

  return (
    <Section title="Password sign-in" description={description}>
      <Stack gap="lg">
        <Stack gap="sm">
          <Text size="sm" weight="medium">
            Step 1. Password {status.hasPassword ? '(set)' : ''}
          </Text>
          {showPasswordForm ? (
            status.sessionFresh ? (
              <div className="w-full space-y-2 md:max-w-sm">
                <Label htmlFor="pw-new">{status.hasPassword ? 'New password' : 'Password'}</Label>
                <Input id="pw-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} />
                <Label htmlFor="pw-confirm">Type it again</Label>
                <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)} />
                <Text size="sm" variant="muted">
                  At least {min} characters. A long phrase is better than a short complicated one.
                </Text>
                <div className="flex gap-2">
                  <Button onClick={() => void savePassword()} disabled={!passwordOk || busy} loading={busy}>
                    {status.hasPassword ? 'Replace password' : 'Set password'}
                  </Button>
                  {changing && (
                    <Button variant="outline" onClick={() => setChanging(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <Text size="sm" variant="muted">
                For safety a password can only be set within 30 minutes of signing in. Sign out, sign in again with an email link, and come
                straight back here.
              </Text>
            )
          ) : (
            <div>
              <Button variant="outline" onClick={() => setChanging(true)}>
                Replace password
              </Button>
            </div>
          )}
        </Stack>

        {status.hasPassword && !status.authenticatorEnabled && (
          <Stack gap="sm">
            <Text size="sm" weight="medium">
              Step 2. Authenticator app
            </Text>
            {!enrolment ? (
              <div className="w-full space-y-2 md:max-w-sm">
                <Text size="sm" variant="muted">
                  Use any authenticator app: Microsoft Authenticator, Google Authenticator, Authy, 1Password and others all work. Enter your
                  password to show the QR code.
                </Text>
                <Input type="password" autoComplete="current-password" placeholder="Your password" value={current} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrent(e.target.value)} />
                <Button onClick={() => void startAuthenticator()} disabled={!current || busy} loading={busy}>
                  Show the QR code
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Text size="sm" variant="muted">
                  In the app choose to add an account, then scan this code. If you cannot scan, type the key in by hand.
                </Text>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrolment.qr} alt="QR code for the authenticator app" width={200} height={200} className="rounded border bg-white p-1" />
                <Text size="sm">
                  Key: <span className="font-mono break-all">{secretOf(enrolment.totpURI)}</span>
                </Text>
                <div className="rounded-md border p-3">
                  <Text size="sm" weight="medium">
                    Backup codes. Save these now; they are shown once.
                  </Text>
                  <Text size="sm" variant="muted">
                    Each code signs you in once if you lose the phone.
                  </Text>
                  <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm md:max-w-sm">
                    {enrolment.backupCodes.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                </div>
                <Text size="sm" weight="medium">
                  Step 3. Confirm
                </Text>
                <div className="w-full space-y-2 md:max-w-sm">
                  <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code from the app" value={code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)} />
                  <Button onClick={() => void confirmAuthenticator()} disabled={code.trim().length < 6 || busy} loading={busy}>
                    Confirm and turn on password sign-in
                  </Button>
                </div>
              </div>
            )}
          </Stack>
        )}

        {status.authenticatorEnabled && (
          <Stack gap="sm">
            <Text size="sm" weight="medium">
              Step 2. Authenticator app (confirmed)
            </Text>
            <div className="w-full space-y-2 md:max-w-sm">
              <Text size="sm" variant="muted">
                To move to a new phone, remove the authenticator and add it again. Removing it turns password sign-in off until then.
              </Text>
              <Input type="password" autoComplete="current-password" placeholder="Your password" value={current} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrent(e.target.value)} />
              <Button variant="outline" onClick={() => void turnOff()} disabled={!current || busy}>
                Remove the authenticator
              </Button>
            </div>
          </Stack>
        )}
      </Stack>
    </Section>
  );
}
