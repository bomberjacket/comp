'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useWaterProgram, type StepStatus, type WaterProgramStep } from '@/hooks/use-water-program';
import type { FrameworkEditorRequirement } from '@db';
import { WaterPlanWriter } from './WaterPlanWriter';
import { WaterChecklistPager } from './water/WaterChecklistPager';
import { WaterEvidenceCollector } from './water/WaterEvidenceCollector';
import { WaterTabletopRecorder } from './water/WaterTabletopRecorder';
import { WaterVendorScorer } from './water/WaterVendorScorer';
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

function StepCard({
  step,
  index,
  orgId,
  wizard,
}: {
  step: WaterProgramStep;
  index: number;
  orgId: string;
  wizard?: { label: string; node: React.ReactNode };
}) {
  const [open, setOpen] = useState(step.status === 'in_progress');
  const [showWizard, setShowWizard] = useState(false);
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
            {wizard && (
              <Button size="sm" onClick={() => setShowWizard((v) => !v)}>
                {showWizard ? 'Close' : wizard.label}
              </Button>
            )}
            <Button size="sm" variant="outline" render={<Link href={`/${orgId}/${step.href}`} />}>
              {ACTION[step.key]}
            </Button>
            {step.details.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide details' : `Show details (${step.details.length})`}
              </Button>
            )}
          </div>
          {showWizard && wizard?.node}
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
 * The water and wastewater program in the order it is built: write the two plans,
 * answer EPA's checklist, fix the gaps, collect evidence, score vendors, then validate
 * by tabletop on a cadence. Each step has a wizard that works on the same records as
 * its full screen, with a written direction that can also be spoken.
 */
export function WaterProgramGuide({
  orgId,
  frameworkInstanceId,
  requirementDefinitions,
}: {
  orgId: string;
  frameworkInstanceId: string;
  requirementDefinitions: FrameworkEditorRequirement[];
}) {
  const { data, error, isLoading, mutate } = useWaterProgram(frameworkInstanceId);
  const { hasPermission } = usePermissions();
  const canEditPolicies = hasPermission('policy', 'update');
  const changed = () => void mutate();
  const wizards: Partial<Record<WaterProgramStep['key'], { label: string; node: React.ReactNode }>> = {
    plans: {
      label: 'Write the plans here',
      node: <WaterPlanWriter orgId={orgId} frameworkInstanceId={frameworkInstanceId} canEdit={canEditPolicies} onChanged={changed} />,
    },
    assess: {
      label: 'Answer question by question',
      node: (
        <WaterChecklistPager
          frameworkInstanceId={frameworkInstanceId}
          requirementDefinitions={requirementDefinitions}
          canEdit={hasPermission('framework', 'update')}
          onChanged={changed}
        />
      ),
    },
    evidence: {
      label: 'Collect evidence here',
      node: (
        <WaterEvidenceCollector orgId={orgId} frameworkInstanceId={frameworkInstanceId} canEdit={hasPermission('task', 'update')} onChanged={changed} />
      ),
    },
    vendors: {
      label: 'Score vendors here',
      node: <WaterVendorScorer orgId={orgId} canEdit={hasPermission('vendor', 'update')} onChanged={changed} />,
    },
    tabletop: {
      label: 'Run a tabletop session',
      node: <WaterTabletopRecorder frameworkInstanceId={frameworkInstanceId} canEdit={hasPermission('framework', 'update')} onChanged={changed} />,
    },
  };
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
        <StepCard
          key={step.key}
          step={step}
          index={i}
          orgId={orgId}
          wizard={wizards[step.key]}
        />
      ))}
    </div>
  );
}
