import type { TabletopSession } from '@/hooks/use-water-wizards';

/** Form state of the tabletop session recorder. */
export interface Draft {
  title: string;
  scenario: string;
  scheduledFor: string;
  heldOn: string;
  facilitator: string;
  participants: string;
  cadenceMonths: number;
  afterAction: string;
  notes: Record<string, { discussion: string; gaps: string }>;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function toDraft(s: TabletopSession | undefined, cadenceMonths: number): Draft {
  return {
    title: s?.title ?? `Tabletop exercise ${new Date().getFullYear()}`,
    scenario: s?.scenario ?? '',
    scheduledFor: s?.scheduledFor ?? '',
    heldOn: s?.heldOn ?? '',
    facilitator: s?.facilitator ?? '',
    participants: s?.participants ?? '',
    cadenceMonths: s?.cadenceMonths ?? cadenceMonths,
    afterAction: s?.afterAction ?? '',
    notes: Object.fromEntries((s?.notes ?? []).map((n) => [n.taskId, { discussion: n.discussion, gaps: n.gaps ?? '' }])),
  };
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
