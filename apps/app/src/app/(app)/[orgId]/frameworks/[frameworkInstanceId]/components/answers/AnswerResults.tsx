'use client';

import { useFrameworkAnswerResults } from '@/hooks/use-framework-answers';
import {
  ANSWER_LABELS,
  DOMAIN_LABELS,
  type AnswerGroupResult,
  type AnswerScoringModel,
  type AnswerValue,
} from '@/types/framework-answers';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@trycompai/design-system';

const VALUE_ORDER: AnswerValue[] = ['yes', 'alternate', 'incomplete', 'scoped', 'no', 'not_applicable'];

/**
 * Sequential fill for a 0–100 % cell: one hue (the theme primary) from light to
 * dark, text stays in text tokens, the number is always printed in the cell. Grey
 * marks "nothing answerable" so it is never read as 0 % met.
 */
function cellStyle(percent: number, answerable: boolean): React.CSSProperties {
  if (!answerable) return { backgroundColor: 'hsl(var(--muted))' };
  const alpha = 0.12 + (percent / 100) * 0.6;
  return { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(2)})` };
}

const SCORING_NOTE: Record<AnswerScoringModel, string> = {
  cpg: 'CPG 2.0: a goal counts when it is Yes for the domain. Incomplete and Scoped are in progress.',
  mil: 'A goal is achieved only when every practice in it is Yes (or Alternate); one Incomplete or No holds the goal back, as in CISA’s MIL scoring.',
  tier: 'Practices are grouped by area; tiers (Basic, Intermediate, Advanced) are in each requirement’s description.',
  standard: 'Yes and Alternate are met; No is a gap; Not applicable is excluded with its justification.',
};

export function AnswerResults({
  frameworkInstanceId,
  scoring,
}: {
  frameworkInstanceId: string;
  scoring: AnswerScoringModel;
}) {
  const { data, isLoading, error } = useFrameworkAnswerResults(frameworkInstanceId);
  if (isLoading) return <Text variant="muted">Computing results…</Text>;
  if (error || !data) return <Text variant="muted">Results are not available for this framework.</Text>;

  const values = VALUE_ORDER.filter((v) => data.totals.some((t) => t.counts[v] > 0) || v === 'yes' || v === 'no');
  const familyRows = groupRows(data.families);
  const controlRows = groupRows(data.controls);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {data.totals.map((t) => (
          <StatTile key={t.domain} result={t} multiDomain={data.domains.length > 1} />
        ))}
        <div className="flex min-w-48 flex-col justify-center">
          <Text size="sm" variant="muted">
            {data.answered} of {data.expected} answers recorded. {SCORING_NOTE[scoring]}
          </Text>
        </div>
      </div>

      <section aria-label="Results by family">
        <div className="mb-2 text-sm font-medium">By family {data.domains.length > 1 ? '(IT and OT)' : ''}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Family</TableHead>
              {data.domains.map((d) => (
                <TableHead key={d} style={{ textAlign: 'right' }}>
                  {data.domains.length > 1 ? `${DOMAIN_LABELS[d]} met` : 'Met'}
                </TableHead>
              ))}
              {values.map((v) => (
                <TableHead key={v} style={{ textAlign: 'right' }} title={ANSWER_LABELS[v].label}>
                  {ANSWER_LABELS[v].short}
                </TableHead>
              ))}
              <TableHead style={{ textAlign: 'right' }}>Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {familyRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
                {data.domains.map((d) => {
                  const r = row.byDomain.get(d);
                  const answerable = !!r && r.total - r.counts.not_applicable > 0 && r.counts.unanswered < r.total;
                  return (
                    <TableCell
                      key={d}
                      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...cellStyle(r?.percent ?? 0, answerable) }}
                      title={r ? describe(r) : ''}
                    >
                      {answerable ? `${r?.percent}%` : '—'}
                    </TableCell>
                  );
                })}
                {values.map((v) => (
                  <TableCell key={v} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {sum(row, v)}
                  </TableCell>
                ))}
                <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sum(row, 'unanswered')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-label="Results by control">
        <div className="mb-2 text-sm font-medium">By {scoring === 'standard' || scoring === 'tier' ? 'control' : 'goal'}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {data.domains.map((d) => (
                <TableHead key={d} style={{ textAlign: 'right' }}>
                  {data.domains.length > 1 ? DOMAIN_LABELS[d] : 'Status'}
                </TableHead>
              ))}
              <TableHead style={{ textAlign: 'right' }}>Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controlRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell title={row.label}>
                  <div className="max-w-xl truncate">{row.label}</div>
                </TableCell>
                {data.domains.map((d) => {
                  const r = row.byDomain.get(d);
                  return (
                    <TableCell key={d} style={{ textAlign: 'right' }}>
                      {!r || r.counts.unanswered === r.total ? (
                        <Badge variant="secondary">Not started</Badge>
                      ) : r.achieved ? (
                        <Badge variant="default">{scoring === 'mil' ? 'Achieved' : 'Met'}</Badge>
                      ) : r.counts.unanswered > 0 ? (
                        <Badge variant="secondary">In progress · {r.percent}%</Badge>
                      ) : (
                        <Badge variant="destructive">Open · {r.percent}%</Badge>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.byDomain.values().next().value?.total ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

interface Row {
  key: string;
  label: string;
  byDomain: Map<string, AnswerGroupResult>;
}

function groupRows(results: AnswerGroupResult[]): Row[] {
  const rows = new Map<string, Row>();
  for (const r of results) {
    const row = rows.get(r.key) ?? { key: r.key, label: r.label, byDomain: new Map() };
    row.byDomain.set(r.domain, r);
    rows.set(r.key, row);
  }
  return [...rows.values()];
}

function sum(row: Row, v: AnswerValue | 'unanswered'): number {
  let n = 0;
  for (const r of row.byDomain.values()) n += r.counts[v];
  return n;
}

function describe(r: AnswerGroupResult): string {
  return VALUE_ORDER.filter((v) => r.counts[v] > 0)
    .map((v) => `${ANSWER_LABELS[v].label}: ${r.counts[v]}`)
    .concat(r.counts.unanswered > 0 ? [`Unanswered: ${r.counts.unanswered}`] : [])
    .join(', ');
}

function StatTile({ result, multiDomain }: { result: AnswerGroupResult; multiDomain: boolean }) {
  const answerable = result.total - result.counts.not_applicable;
  return (
    <div className="min-w-44 rounded-md border border-border bg-card p-4">
      <Text size="sm" variant="muted">
        {multiDomain ? `${DOMAIN_LABELS[result.domain]} met` : 'Met'}
      </Text>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{result.percent}%</span>
        <Text size="sm" variant="muted">
          {result.counts.yes + result.counts.alternate} of {answerable}
        </Text>
      </div>
      <Text size="sm" variant="muted">
        {result.counts.unanswered} unanswered · {result.counts.not_applicable} N/A
      </Text>
    </div>
  );
}
