'use client';

import { useWaterRoster } from '@/hooks/use-water-roster';
import { Button } from '@trycompai/design-system';

interface Props {
  frameworkInstanceId: string;
  disabled?: boolean;
  onFill: (facilitator: string, participants: string) => void;
}

/**
 * Fills the facilitator and participants of a tabletop session from the Who's who list:
 * the incident commander facilitates, and everyone on the list takes part, each with
 * the roles they hold. The result stays editable.
 */
export function RosterFill({ frameworkInstanceId, disabled, onFill }: Props) {
  const { roster } = useWaterRoster(frameworkInstanceId);
  if (!roster || roster.people.length === 0) return null;
  const commander = roster.people.find((p) => p.roles.includes('Incident commander')) ?? roster.people[0];
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={() => onFill(commander?.name ?? '', roster.people.map((p) => `${p.name} (${p.roles.join(', ')})`).join('\n'))}
    >
      Fill in from Who&apos;s who
    </Button>
  );
}
