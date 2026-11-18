'use client';

import { useWaterRoster } from '@/hooks/use-water-roster';
import { Text } from '@trycompai/design-system';
import { useState } from 'react';
import { WaterPlanWriter } from '../WaterPlanWriter';
import { WaterRosterEditor } from './WaterRosterEditor';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

/**
 * Step 1 of the water program: Who's who first, then the two plans. The list opens
 * first until it has been saved once; after that the plans open, with a button back to it.
 */
export function WaterPlansStep({ orgId, frameworkInstanceId, canEdit, onChanged }: Props) {
  const { roster, error, isLoading } = useWaterRoster(frameworkInstanceId);
  const [chosen, setChosen] = useState<'roster' | 'plans' | null>(null);

  if (error) return <Text variant="muted">Step 1 could not be loaded: {error.message}</Text>;
  if (isLoading || !roster) return <Text variant="muted">Loading…</Text>;

  const view = chosen ?? (roster.saved || !canEdit ? 'plans' : 'roster');
  if (view === 'roster') {
    return <WaterRosterEditor orgId={orgId} frameworkInstanceId={frameworkInstanceId} canEdit={canEdit} onChanged={onChanged} onDone={() => setChosen('plans')} />;
  }
  return (
    <WaterPlanWriter
      orgId={orgId}
      frameworkInstanceId={frameworkInstanceId}
      canEdit={canEdit}
      onChanged={onChanged}
      roster={{ filled: roster.progress.filled, total: roster.progress.total, onOpen: () => setChosen('roster') }}
    />
  );
}
