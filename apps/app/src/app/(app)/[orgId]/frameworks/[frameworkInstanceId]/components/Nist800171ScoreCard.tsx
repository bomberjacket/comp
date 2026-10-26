'use client';

import type {
  Level2Eligibility,
  Nist800171Score,
  ScoredRequirement,
} from '@/types/nist-800-171-score';
import { Badge, Text } from '@trycompai/design-system';
import { ChevronDown, ChevronRight } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';

const ELIGIBILITY: Record<
  Level2Eligibility,
  { label: string; variant: 'default' | 'secondary' | 'destructive'; detail: string }
> = {
  final: {
    label: 'Final Level 2',
    variant: 'default',
    detail: 'Every requirement is met.',
  },
  conditional: {
    label: 'Conditional Level 2',
    variant: 'secondary',
    detail:
      'Score is at least 80 % and every open item may be carried on a POA&M (180-day close-out).',
  },
  fail: {
    label: 'Not eligible',
    variant: 'destructive',
    detail: 'An open requirement cannot be carried on a POA&M, or the score is below 80 %.',
  },
  not_assessable: {
    label: 'Not assessable',
    variant: 'destructive',
    detail:
      'The System Security Plan requirement (3.12.4) is not met, so an assessment cannot be completed.',
  },
};

export function Nist800171ScoreCard({
  score,
  orgId,
  frameworkInstanceId,
}: {
  score: Nist800171Score;
  orgId: string;
  frameworkInstanceId: string;
}) {
  const [showOpen, setShowOpen] = useState(false);
  const eligibility = ELIGIBILITY[score.eligibility];
  const open = score.requirements.filter((r) => r.outcome === 'not_met');
  const partialOpen = open.filter((r) => r.partialPoints !== null);
  const ChevronIcon = showOpen ? ChevronDown : ChevronRight;

  return (
    <section
      aria-label="NIST SP 800-171 score"
      className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
          <Text size="sm" variant="muted">
            / {score.maxScore}
          </Text>
        </div>
        <Badge variant={eligibility.variant}>{eligibility.label}</Badge>
        <Text size="sm" variant="muted">
          SPRS-style score per 32 CFR 170.24
          {score.placeholderWeights ? ' (Rev 3: placeholder weights carried from Rev 2)' : ''}
        </Text>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <Stat label="met" value={score.requirementsMet} />
        <Stat label="not met" value={score.requirementsNotMet} />
        <Stat label="not applicable" value={score.requirementsNotApplicable} />
        <Stat label="5-point open" value={score.fivePointNotMet} />
        <Stat label="POA&M-eligible open" value={score.poamEligibleNotMet} />
        {score.objectivesWithoutTask > 0 && (
          <Stat label="objectives without a task" value={score.objectivesWithoutTask} />
        )}
      </div>

      <Text size="sm" variant="muted">
        {eligibility.detail} A requirement is MET only when every assessment objective's evidence
        task is done or not relevant.
        {partialOpen.length > 0 &&
          ` ${partialOpen.map((r) => r.number).join(' and ')} may qualify for the 3-point partial deduction; that is a manual determination, so the full 5 points are deducted here.`}
      </Text>

      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex w-fit items-center gap-1 text-sm font-medium hover:underline"
            onClick={() => setShowOpen((v) => !v)}
            aria-expanded={showOpen}
          >
            <ChevronIcon size={16} />
            Open requirements ({open.length}, {score.totalDeduction} points)
          </button>
          {showOpen && (
            <ul className="flex flex-col gap-1 pl-5 text-sm">
              {open.map((r) => (
                <OpenRequirement
                  key={r.number}
                  requirement={r}
                  orgId={orgId}
                  frameworkInstanceId={frameworkInstanceId}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-medium tabular-nums">{value}</span>
      <Text size="sm" variant="muted">
        {label}
      </Text>
    </span>
  );
}

function OpenRequirement({
  requirement,
  orgId,
  frameworkInstanceId,
}: {
  requirement: ScoredRequirement;
  orgId: string;
  frameworkInstanceId: string;
}) {
  const first = requirement.objectives[0];
  const href = first
    ? `/${orgId}/frameworks/${frameworkInstanceId}/requirements/${first.requirementId}`
    : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {href ? (
        <Link href={href} className="font-medium hover:underline">
          {requirement.number}
        </Link>
      ) : (
        <span className="font-medium">{requirement.number}</span>
      )}
      <Text size="sm" variant="muted">
        {requirement.sspGate
          ? 'SSP gate, no points'
          : `−${requirement.deduction} pt${requirement.placeholder ? ' (placeholder)' : ''}`}
      </Text>
      <Text size="sm" variant="muted">
        {requirement.objectivesMet}/{requirement.objectivesTotal} objectives
        {requirement.objectivesWithoutTask > 0
          ? `, ${requirement.objectivesWithoutTask} without a task`
          : ''}
      </Text>
      {requirement.poamEligible && <Badge variant="outline">POA&M eligible</Badge>}
    </li>
  );
}
