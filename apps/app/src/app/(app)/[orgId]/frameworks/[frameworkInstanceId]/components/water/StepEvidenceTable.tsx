'use client';

import type { WaterProgramStep } from '@/hooks/use-water-program';
import Link from 'next/link';

const date = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/**
 * The evidence goals of step 4 as a table: how each piece of evidence is collected, its
 * status, when that status last changed, and when new evidence is next due (the date it
 * was completed plus the task's cycle).
 */
export function StepEvidenceTable({ orgId, details }: { orgId: string; details: WaterProgramStep['details'] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Goal</th>
            <th className="px-3 py-1.5 font-medium">Collected by</th>
            <th className="px-3 py-1.5 font-medium">Status</th>
            <th className="px-3 py-1.5 font-medium">Status changed</th>
            <th className="px-3 py-1.5 font-medium">New evidence due</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {details.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <td className="px-3 py-1.5">
                {d.href ? (
                  <Link href={`/${orgId}/${d.href}`} className="text-primary hover:underline">
                    {d.label}
                  </Link>
                ) : (
                  d.label
                )}
              </td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{d.method}</td>
              <td className={`whitespace-nowrap px-3 py-1.5 text-xs ${d.missing ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>{d.status}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">{date(d.changedOn) || 'Not changed yet'}</td>
              <td className={`whitespace-nowrap px-3 py-1.5 text-xs ${d.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                {d.nextDueOn ? `${date(d.nextDueOn)}${d.overdue ? ' (overdue)' : ''}` : 'When done'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
