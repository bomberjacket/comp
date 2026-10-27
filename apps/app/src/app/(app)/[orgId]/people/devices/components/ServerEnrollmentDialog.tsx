'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';
import { useEnrollmentTokens, type CreatedEnrollmentToken } from '../hooks/useEnrollmentTokens';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/** The one-liner an operator runs on the server, with the token shown once. */
export function enrollCommand(token: string, apiUrl: string = API_URL): string {
  return `sudo ./install-headless.sh --token ${token} --api ${apiUrl}`;
}

export function formatTokenStatus(t: {
  status: string;
  useCount: number;
  maxUses: number;
  expiresAt: string;
}): string {
  const expires = new Date(t.expiresAt).toLocaleDateString();
  if (t.status === 'active') return `${t.useCount}/${t.maxUses} used, expires ${expires}`;
  return `${t.status}, ${t.useCount}/${t.maxUses} used`;
}

/**
 * Servers have no desktop and no browser, so the tray agent's portal login
 * cannot run there. This dialog creates an enrollment token (shown once) and
 * the install command that enrolls the headless agent with it.
 */
export function ServerEnrollmentDialog() {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const canManage = hasPermission('member', 'update');
  const { tokens, createToken, revokeToken, isLoading } = useEnrollmentTokens(open && canManage);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedEnrollmentToken | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Give the token a name, e.g. the servers or the tool that will use it.');
      return;
    }
    setBusy(true);
    try {
      const token = await createToken({ name: name.trim() });
      setCreated(token);
      setName('');
    } catch (err) {
      toast.error(
        `Could not create token: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeToken(id);
      toast.success('Token revoked. Devices already enrolled keep reporting.');
    } catch (err) {
      toast.error(`Could not revoke: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Clipboard unavailable; select the text and copy it');
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setCreated(null);
          setOpen(true);
        }}
      >
        Enroll a server
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>Enroll a server (headless agent)</DialogTitle>
            <DialogDescription>
              Servers have no desktop, so the agent runs as a system service and enrolls with a
              token instead of a sign-in. Create a token, then run the install command on each
              server. The token is shown once; enrolled servers are attributed to you.
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-3">
              <Label>Enrollment token for &ldquo;{created.name}&rdquo; (shown once)</Label>
              <div className="flex gap-2">
                <Input readOnly value={created.token} />
                <Button variant="outline" size="sm" onClick={() => copy(created.token, 'Token')}>
                  Copy
                </Button>
              </div>
              <Label>Install command (run as root on the server)</Label>
              <div className="flex gap-2">
                <Input readOnly value={enrollCommand(created.token)} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(enrollCommand(created.token), 'Command')}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(created.expiresAt).toLocaleDateString()}, up to {created.maxUses}{' '}
                servers. The binary and install script are in the device agent release folder.
              </p>
              <Button variant="outline" size="sm" onClick={() => setCreated(null)}>
                Create another
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="enrollment-token-name">Token name</Label>
              <div className="flex gap-2">
                <Input
                  id="enrollment-token-name"
                  placeholder="e.g. Shop servers, Ansible"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
                <Button size="sm" onClick={handleCreate} disabled={busy}>
                  Create token
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <Label>Existing tokens</Label>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : tokens.length === 0 ? (
              <p className="text-xs text-muted-foreground">No enrollment tokens yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {t.name}{' '}
                        <span className="font-mono text-xs text-muted-foreground">
                          {t.tokenPrefix}…
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatTokenStatus(t)}</div>
                    </div>
                    {t.status === 'active' && (
                      <Button variant="outline" size="sm" onClick={() => handleRevoke(t.id)}>
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
