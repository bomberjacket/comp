'use client';

import { api } from '@/lib/api-client';
import { Button } from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * BNI platform admin: authorise a person to sign in by emailing a one-time setup link.
 * "Reset sign-in" also clears a lost authenticator app and ends the person's sessions;
 * it asks for a second click because it signs them out everywhere.
 */
export function SetupLinkButtons({ email, allowReset = true }: { email: string; allowReset?: boolean }) {
  const [busy, setBusy] = useState<'send' | 'reset' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const send = async (resetAuthenticator: boolean) => {
    setBusy(resetAuthenticator ? 'reset' : 'send');
    const res = await api.post('/v1/admin/setup-links', { email, resetAuthenticator });
    setBusy(null);
    setConfirmReset(false);
    if (res.error) return toast.error(res.error);
    toast.success(resetAuthenticator ? `Sign-in reset. Setup link sent to ${email}.` : `Setup link sent to ${email}.`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => void send(false)} loading={busy === 'send'} disabled={busy !== null}>
        Send setup link
      </Button>
      {allowReset &&
        (confirmReset ? (
          <Button size="sm" variant="destructive" onClick={() => void send(true)} loading={busy === 'reset'} disabled={busy !== null}>
            Confirm reset
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
            Reset sign-in
          </Button>
        ))}
    </div>
  );
}
