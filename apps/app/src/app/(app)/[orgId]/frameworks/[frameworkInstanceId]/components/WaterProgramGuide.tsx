'use client';

import { useWaterProgram, type StepStatus, type WaterProgramStep } from '@/hooks/use-water-program';
import { Badge, Button, Text } from '@trycompai/design-system';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const STATUS: Record<StepStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  not_started: { label: 'Not started', variant: 'outline' },
  in_progress: { label: 'In progress', variant: 'secondary' },
  done: { label: 'Done', variant: 'default' },
};

const ACTION: Record<WaterProgramStep['key'], string> = {
  plans: 'Open policies',
  assess: 'Open the checklist',
  gaps: 'See results',
  evidence: 'Open evidence tasks',
  vendors: 'Open vendors',
  tabletop: 'Open interview tasks',
};

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === 'in_progress') return <CircleDot className="h-5 w-5 text-amber-500" />;
  return <Circle className="h-5 w-5 text-muted-foreground" />;
}

function StepCard({ step, index, orgId }: { step: WaterProgramStep; index: number; orgId: string }) {
  const [open, setOpen] = useState(step.status === 'in_progress');
  const pct = step.total > 0 ? Math.round((step.done / step.total) * 100) : 0;
  const meta = STATUS[step.status];
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <StepIcon status={step.status} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              Step {index + 1}. {step.title}
            </h3>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          <Text size="sm" variant="muted">
            {step.description}
          </Text>
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-muted/50">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{step.summary}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href={`/${orgId}/${step.href}`} />}>
              {ACTION[step.key]}
            </Button>
            {step.details.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide details' : `Show details (${step.details.length})`}
              </Button>
            )}
          </div>
          {open && step.details.length > 0 && (
            <ul className="divide-y rounded-md border text-sm">
              {step.details.map((d, i) => (
                <li key={`${d.label}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  {d.href ? (
                    <Link href={`/${orgId}/${d.href}`} className="truncate text-primary hover:underline">
                      {d.label}
                    </Link>
                  ) : (
                    <span className="truncate">{d.label}</span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">{d.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The water and wastewater program in order: answer EPA's checklist, work the gaps,
 * write the two plans, score vendors, run the tabletop. Progress comes live from the
 * answers, policies, vendor checklists and interview tasks of this organization.
 */
export function WaterProgramGuide({ orgId, frameworkInstanceId }: { orgId: string; frameworkInstanceId: string }) {
  const { data, error, isLoading } = useWaterProgram(frameworkInstanceId);
  if (error) return <Text variant="muted">The program guide could not be loaded: {error.message}</Text>;
  if (isLoading || !data) return <Text variant="muted">Loading the program guide…</Text>;
  const done = data.steps.filter((s) => s.status === 'done').length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" variant="muted">
          Six steps, in the order a utility builds the program: policies and plans, implementation status, fixes,
          operational evidence, third parties, then validation by tabletop on a cadence. Each card reads the live
          state of its screen; nothing here is answered twice.
        </Text>
        <Badge variant="secondary">
          {done} of {data.steps.length} steps done
        </Badge>
      </div>
      {data.steps.map((step, i) => (
        <StepCard key={step.key} step={step} index={i} orgId={orgId} />
      ))}
    </div>
  );
}
