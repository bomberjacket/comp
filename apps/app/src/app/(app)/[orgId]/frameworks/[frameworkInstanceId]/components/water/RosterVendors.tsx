'use client';

import { useVendorActions, useVendors } from '@/hooks/use-vendors';
import { useWaterRoster } from '@/hooks/use-water-roster';
import { Badge, Button, Input, Text } from '@trycompai/design-system';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
}

/**
 * The vendor part of Who's who. The list is the platform's one vendor list (the Vendors
 * page); here the utility ticks the companies that have network or remote access to its
 * systems. Only ticked vendors are carried into the plans, so ordinary suppliers stay on
 * the Vendors page without cluttering the plans. Nothing is deleted from here. A tick is
 * saved at once.
 */
export function RosterVendors({ orgId, frameworkInstanceId, canEdit }: Props) {
  const { data, isLoading, mutate } = useVendors();
  const { createVendor } = useVendorActions();
  const { roster, saveAccessVendors } = useWaterRoster(frameworkInstanceId);
  const [name, setName] = useState('');
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const vendors = data?.data?.data ?? [];
  // Until any vendor is marked, every vendor counts (and shows ticked).
  const marked = roster?.accessVendors ?? null;
  const isMarked = (id: string) => marked === null || marked.includes(id);
  const markedCount = vendors.filter((v) => isMarked(v.id)).length;

  const store = async (ids: string[], done?: string) => {
    setBusy(true);
    try {
      await saveAccessVendors(ids);
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, on: boolean) => {
    const current = vendors.filter((v) => isMarked(v.id)).map((v) => v.id);
    void store(on ? [...current, id] : current.filter((x) => x !== id));
  };

  const add = async () => {
    setBusy(true);
    try {
      const created = await createVendor({ name: name.trim(), description: what.trim() });
      setName('');
      setWhat('');
      await mutate();
      // A vendor added here is one with access: tick it.
      await saveAccessVendors([...vendors.filter((v) => isMarked(v.id)).map((v) => v.id), created.id]);
      toast.success('Vendor added and ticked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the vendor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="medium">
          Vendors, integrators and service providers
        </Text>
        <Badge variant="outline">
          {markedCount} of {vendors.length} ticked
        </Badge>
      </div>
      <Text size="sm" variant="muted">
        Tick every company that has network or remote access to the utility&apos;s systems, or that supports the control system: the SCADA
        integrator, the IT provider, equipment vendors with remote support. Only ticked companies are carried into the plans. Leave ordinary
        suppliers unticked; they stay on the Vendors page.
      </Text>
      {isLoading ? (
        <Text size="sm" variant="muted">
          Loading vendors…
        </Text>
      ) : vendors.length === 0 ? (
        <Text size="sm" variant="muted">
          No vendors listed yet.
        </Text>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {vendors.map((v) => {
            const on = isMarked(v.id);
            return (
              <li key={v.id} className={`flex flex-wrap items-baseline gap-3 px-3 py-2 ${on ? 'bg-primary/10' : ''}`}>
                <label className="flex items-baseline gap-2">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(v.id, e.target.checked)} disabled={!canEdit || busy} aria-label={`${v.name} has network or remote access`} />
                  <span className={on ? 'font-medium' : 'text-muted-foreground'}>{v.name}</span>
                </label>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{v.description}</span>
                <Link href={`/${orgId}/vendors/${v.id}`} className="text-xs text-primary underline underline-offset-2">
                  Open
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Company name" disabled={busy} />
          <Input value={what} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhat(e.target.value)} placeholder="What they do for the utility and what they can reach" disabled={busy} />
          <Button size="sm" variant="outline" onClick={() => void add()} disabled={busy || !name.trim() || !what.trim()}>
            Add vendor
          </Button>
        </div>
      )}
      <Text size="sm" variant="muted">
        To delete a vendor altogether, or to edit its contacts, contracts and scoring, use the{' '}
        <Link href={`/${orgId}/vendors`} className="text-primary underline underline-offset-2">
          Vendors page
        </Link>
        .
      </Text>
    </section>
  );
}
