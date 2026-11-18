'use client';

import { authClient } from '@/app/lib/auth-client';
import { Button } from '@trycompai/ui/button';
import { Input } from '@trycompai/ui/input';
import { useState } from 'react';

type Stage = 'password' | 'code' | 'backup';

/**
 * BNI: portal sign-in is password plus authenticator code, the same as the main app.
 * Emailed one-time passwords are off. An account that is not set up yet is refused by
 * the server with a message to ask the BNI administrator for a setup link.
 */
export function PasswordSignIn({ deviceAuthRedirect }: { deviceAuthRedirect?: string }) {
  const [stage, setStage] = useState<Stage>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const finish = () => {
    window.location.href = deviceAuthRedirect || '/';
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.status === 403 && error.message ? error.message : 'The email or password is not right.');
      return;
    }
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setPassword('');
      setStage('code');
      return;
    }
    finish();
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const value = code.trim();
    const { error } =
      stage === 'backup'
        ? await authClient.twoFactor.verifyBackupCode({ code: value })
        : await authClient.twoFactor.verifyTotp({ code: value.replace(/\s+/g, '') });
    setBusy(false);
    if (error) {
      setCode('');
      setMessage(error.message || (stage === 'backup' ? 'That backup code is not valid or was already used.' : 'That code is not right. Wait for the next one and try again.'));
      return;
    }
    finish();
  };

  if (stage !== 'password') {
    const backup = stage === 'backup';
    return (
      <form onSubmit={submitCode} className="flex flex-col space-y-3">
        <p className="text-sm text-muted-foreground">
          {backup ? 'Enter one of the backup codes you saved when you set up the authenticator. Each code works once.' : 'Open your authenticator app and enter the 6-digit code for this account.'}
        </p>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={backup ? 'Backup code' : '6-digit code'} inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus className="h-11" />
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy || code.trim().length < 6}>
          Verify and sign in
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            setStage(backup ? 'code' : 'backup');
            setCode('');
            setMessage(null);
          }}
        >
          {backup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="flex flex-col space-y-3">
      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="username" autoCapitalize="none" className="h-11" />
      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className="h-11" />
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={busy || !email.trim() || !password}>
        Sign in
      </Button>
      <p className="text-xs text-muted-foreground">
        Sign-in asks for your password and a code from your authenticator app. No account yet, or locked out? Ask your BNI administrator for a setup link.
      </p>
    </form>
  );
}
