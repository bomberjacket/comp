'use client';

import { VendorProcurementChecklist } from '@/app/(app)/[orgId]/vendors/[vendorId]/components/procurement/VendorProcurementChecklist';
import { useVendors } from '@/hooks/use-vendors';
import { Button, Text } from '@trycompai/design-system';
import Link from 'next/link';
import { useState } from 'react';
import { VoiceDirection } from './VoiceDirection';

interface Props {
  orgId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

/**
 * EPA's procurement checklist without leaving the guide: pick a vendor, then weight and
 * score the sheet. It is the same sheet as the vendor's "Cyber procurement" tab.
 */
export function WaterVendorScorer({ orgId, canEdit, onChanged }: Props) {
  const { data, isLoading } = useVendors();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const list = data?.data?.data ?? [];
  const vendor = list.find((v) => v.id === vendorId) ?? list[0];

  if (isLoading) return <Text variant="muted">Loading vendors…</Text>;
  if (!vendor) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <VoiceDirection direction="No vendors are recorded yet. Open the Vendors page and add each supplier, integrator and managed service provider that touches the utility's systems. Then come back here to score them." />
        <Button size="sm" variant="outline" render={<Link href={`/${orgId}/vendors`} />}>
          Open vendors
        </Button>
      </div>
    );
  }

  const direction = `Scoring ${vendor.name}. Choose the supplier sheet for a product or service, or the integrator sheet for a system integrator or managed service provider. For each question set a weight from 0 to 3 for how much it matters to the utility, then a score from 0 to 3 for the vendor's response. Weight 0 leaves the question out. Record what goes into the contract, then choose Save checklist and pick the next vendor.`;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection direction={direction} />
      <div className="flex flex-wrap items-center gap-2">
        {list.map((v) => (
          <Button key={v.id} size="sm" variant={v.id === vendor.id ? 'default' : 'outline'} onClick={() => setVendorId(v.id)}>
            {v.name}
          </Button>
        ))}
        <Link href={`/${orgId}/vendors`} className="text-xs text-primary underline underline-offset-2">
          Add a vendor
        </Link>
      </div>
      <VendorProcurementChecklist key={vendor.id} vendorId={vendor.id} canEdit={canEdit} onSaved={onChanged} />
    </div>
  );
}
