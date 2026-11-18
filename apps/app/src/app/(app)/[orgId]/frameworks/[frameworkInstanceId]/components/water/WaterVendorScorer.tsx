'use client';

import { VendorProcurementChecklist } from '@/app/(app)/[orgId]/vendors/[vendorId]/components/procurement/VendorProcurementChecklist';
import { useVendors } from '@/hooks/use-vendors';
import { useWaterRoster } from '@/hooks/use-water-roster';
import { Button, Text } from '@trycompai/design-system';
import Link from 'next/link';
import { useState } from 'react';
import { vendorGuidance } from './guidance-steps';
import { VoiceDirection } from './VoiceDirection';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

/**
 * EPA's procurement checklist without leaving the guide: pick a vendor, then weight and
 * score the sheet. It is the same sheet as the vendor's "Cyber procurement" tab. The
 * vendors offered are the ones ticked on Who's who as having network or remote access.
 */
export function WaterVendorScorer({ orgId, frameworkInstanceId, canEdit, onChanged }: Props) {
  const { data, isLoading } = useVendors();
  const { roster } = useWaterRoster(frameworkInstanceId);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const everyVendor = data?.data?.data ?? [];
  const ticked = roster?.accessVendors ?? null;
  const list = ticked ? everyVendor.filter((v) => ticked.includes(v.id)) : everyVendor;
  const hidden = everyVendor.length - list.length;
  const vendor = list.find((v) => v.id === vendorId) ?? list[0];

  if (isLoading) return <Text variant="muted">Loading vendors…</Text>;
  if (!vendor) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <VoiceDirection guidance={vendorGuidance(null)} />
        {hidden > 0 && (
          <Text size="sm" variant="muted">
            No vendor is ticked on Who&apos;s who as having network or remote access. Open step 1, choose &quot;1. Who&apos;s who and vendors&quot; and
            tick the ones to score.
          </Text>
        )}
        <Button size="sm" variant="outline" render={<Link href={`/${orgId}/vendors`} />}>
          Open vendors
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection guidance={vendorGuidance(vendor.name)} />
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
      {hidden > 0 && (
        <Text size="sm" variant="muted">
          Showing the {list.length} vendors ticked on Who&apos;s who (step 1) as having network or remote access. {hidden} other{hidden === 1 ? ' is' : 's are'} not
          shown; tick them there to score them.
        </Text>
      )}
      <VendorProcurementChecklist key={vendor.id} vendorId={vendor.id} canEdit={canEdit} onSaved={onChanged} />
    </div>
  );
}
