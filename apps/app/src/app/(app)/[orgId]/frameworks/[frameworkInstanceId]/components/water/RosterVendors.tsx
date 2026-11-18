'use client';

import { useVendorActions, useVendors } from '@/hooks/use-vendors';
import { Button, Input, Text } from '@trycompai/design-system';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
}

/**
 * The vendor part of Who's who. Vendors, integrators and service providers are one list
 * for the whole platform (the Vendors page); this shows that list and adds to it, so the
 * plans' vendor boxes and the vendor scoring step all start from the same names.
 */
export function RosterVendors({ orgId, frameworkInstanceId, canEdit }: Props) {
  const { data, isLoading, mutate } = useVendors();
  const { createVendor } = useVendorActions();
  const { mutate: mutateAny } = useSWRConfig();
  const [name, setName] = useState('');
  const [what, setWhat] = useState('');
  const [adding, setAdding] = useState(false);
  const vendors = data?.data?.data ?? [];

  const add = async () => {
    setAdding(true);
    try {
      await createVendor({ name: name.trim(), description: what.trim() });
      setName('');
      setWhat('');
      await mutate();
      // The plans' vendor boxes start from this list.
      await mutateAny(`/v1/water-program/${frameworkInstanceId}/plans`);
      toast.success('Vendor added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the vendor');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="space-y-3">
      <Text size="sm" weight="medium">
        Vendors, integrators and service providers
      </Text>
      <Text size="sm" variant="muted">
        List every company with network or remote access, or that supports the control system: the SCADA integrator, the IT provider,
        equipment vendors with remote support. The plans&apos; vendor boxes and the vendor scoring step start from this list.
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
          {vendors.map((v) => (
            <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
              <Link href={`/${orgId}/vendors/${v.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                {v.name}
              </Link>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{v.description}</span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Company name" disabled={adding} />
          <Input value={what} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhat(e.target.value)} placeholder="What they do for the utility and what they can reach" disabled={adding} />
          <Button size="sm" variant="outline" onClick={() => void add()} disabled={adding || !name.trim() || !what.trim()} loading={adding}>
            Add vendor
          </Button>
        </div>
      )}
      <Text size="sm" variant="muted">
        Contacts, contracts and scoring for each vendor are on the{' '}
        <Link href={`/${orgId}/vendors`} className="text-primary underline underline-offset-2">
          Vendors page
        </Link>
        .
      </Text>
    </section>
  );
}
