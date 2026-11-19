'use client';

import { useWaterRoster, type WaterRoster } from '@/hooks/use-water-roster';

/**
 * BNI's plain-words reading of a checklist question, and the Who's who role that answers
 * it. EPA's own wording stays as published above this note; this only says what the
 * question is getting at and who the utility has already named.
 */
const NOTES: Record<string, { plain: string; role: string; roleName: string }> = {
  '1.B': {
    plain: 'Overall cybersecurity for the whole utility, IT and OT together: is one named role accountable for all of it?',
    role: 'cyber_lead',
    roleName: 'Cybersecurity lead (overall, IT and OT)',
  },
  '1.C': {
    plain: 'OT only: is one named role accountable for the security oversight of the control systems (SCADA, PLCs and the plant network)? At a small utility this can be the same person as in 1.B.',
    role: 'ot_lead',
    roleName: 'OT (control systems) security lead',
  },
};

/** The person behind a role, following "same person as"; a circle falls back to the first name typed in it. */
function personOf(roster: WaterRoster, key: string) {
  const chain = [];
  const seen = new Set<string>();
  let current = key;
  while (!seen.has(current)) {
    seen.add(current);
    const p = roster.staff[current];
    if (!p) return undefined;
    if (!p.sameAs) return p;
    chain.push(p);
    current = p.sameAs;
  }
  return chain.find((p) => p.name);
}

export function ChecklistRosterNote({ frameworkInstanceId, identifier }: { frameworkInstanceId: string; identifier: string }) {
  const note = NOTES[identifier];
  const { roster } = useWaterRoster(frameworkInstanceId, !!note);
  if (!note) return null;
  const person = roster ? personOf(roster, note.role) : undefined;
  return (
    <div className="space-y-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
      <p>
        <span className="font-medium">In plain words: </span>
        {note.plain}
      </p>
      {roster && (
        <p className="text-muted-foreground">
          {person?.name ? (
            <>
              Who&apos;s who names <span className="font-medium text-foreground">{[person.name, person.title].filter(Boolean).join(', ')}</span> as {note.roleName}. If that
              is right, the answer is Yes.
            </>
          ) : (
            <>Who&apos;s who has nobody as {note.roleName} yet. Name the person under step 1, part 1, or answer No or In progress.</>
          )}
        </p>
      )}
    </div>
  );
}
