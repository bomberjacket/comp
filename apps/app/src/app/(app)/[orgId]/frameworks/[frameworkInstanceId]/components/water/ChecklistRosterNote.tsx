'use client';

import { useWaterPlans } from '@/hooks/use-water-program';
import { useWaterRoster, type WaterRoster } from '@/hooks/use-water-roster';

/**
 * BNI's plain-words reading of a checklist question, and what the utility has already
 * recorded that answers it: a Who's who role, or a box of the risk plan. EPA's own wording
 * stays as published above this note.
 */
const NOTES: Record<string, { plain: string; role?: string; roleName?: string; planBox?: string; planBoxName?: string }> = {
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
  '1.D': {
    plain:
      'Do the IT staff, the OT staff and their vendors meet regularly? These meetings are where each side learns what the other needs: planned changes and roadmaps, shared procedures, and cross-training on the products each side runs. EPA asks that they happen regularly, not what is on the agenda.',
    planBox: 'IT and OT coordination meeting',
    planBoxName: 'the risk plan (section 2, IT and OT coordination meeting)',
  },
  '1.I': {
    plain:
      'This is about how the utility buys, not an audit of the vendor. Before buying an IT or OT product or service, does the utility weigh cybersecurity alongside price and function: how secure the product is, and how the supplier handles security? Scoring a vendor with the EPA procurement sheet (step 5) is one way to do it.',
    planBox: 'Who scores vendors before a purchase',
    planBoxName: 'the risk plan (section 5, who scores vendors before a purchase)',
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
  const { roster } = useWaterRoster(frameworkInstanceId, !!note?.role);
  const { plans } = useWaterPlans(frameworkInstanceId, !!note?.planBox);
  if (!note) return null;
  const person = roster && note.role ? personOf(roster, note.role) : undefined;
  const recorded = plans
    .flatMap((p) => p.sections)
    .flatMap((sec) => sec.fields)
    .find((f) => f.label === note.planBox)
    ?.value.trim();
  return (
    <div className="space-y-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
      <p>
        <span className="font-medium">In plain words: </span>
        {note.plain}
      </p>
      {note.planBox && plans.length > 0 && (
        <p className="text-muted-foreground">
          {recorded ? (
            <>
              Already recorded in {note.planBoxName}: <span className="font-medium text-foreground">{recorded}</span>. If that is what happens, the answer is Yes.
            </>
          ) : (
            <>Nothing is recorded yet in {note.planBoxName}. If the utility does not do this, answer No or In progress.</>
          )}
        </p>
      )}
      {note.role && roster && (
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
