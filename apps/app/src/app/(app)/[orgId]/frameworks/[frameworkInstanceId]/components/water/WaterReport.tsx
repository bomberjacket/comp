'use client';

import { useWaterReport, type WaterReportQuestion } from '@/hooks/use-water-wizards';
import { Button, Text } from '@trycompai/design-system';
import { Printer } from 'lucide-react';

const ANSWER: Record<string, string> = { yes: 'Yes', incomplete: 'In progress', no: 'No', not_applicable: 'Not applicable' };
const answerLabel = (a: string | null) => (a ? (ANSWER[a] ?? a) : 'Not answered');

/** Print only the report: the app shell is hidden and the report takes the page. */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .water-report, .water-report * { visibility: visible !important; }
  .water-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; font-size: 10pt; }
  .water-report .no-print { display: none !important; }
  .water-report h2 { break-after: avoid; }
  .water-report tr { break-inside: avoid; }
}`;

const th = 'border px-2 py-1 text-left align-bottom text-xs font-semibold';
const td = 'border px-2 py-1 align-top text-sm';

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      {children}
    </section>
  );
}

function byPriority(a: WaterReportQuestion, b: WaterReportQuestion) {
  return Number(b.priority) - Number(a.priority) || a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
}

/**
 * The water program on paper, from the live records: assessment report (every EPA
 * question with its answer), risk mitigation plan (every No and In progress, EPA
 * priority first), plan status and the after-action report of the last tabletop.
 */
export function WaterReport({ frameworkInstanceId }: { frameworkInstanceId: string }) {
  const { data, error, isLoading } = useWaterReport(frameworkInstanceId);
  if (error) return <Text variant="muted">The report could not be loaded: {error.message}</Text>;
  if (isLoading || !data) return <Text variant="muted">Building the report…</Text>;

  const gaps = data.questions.filter((q) => q.answer === 'no' || q.answer === 'incomplete').sort(byPriority);
  const unanswered = data.expected - data.answered;
  const session = data.tabletop.session;
  const { cadence } = data.tabletop;

  return (
    <div className="water-report space-y-6 rounded-lg border p-6">
      <style>{PRINT_CSS}</style>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{data.utility}: water and wastewater cybersecurity report</h1>
          <p className="text-sm text-muted-foreground">
            {data.framework}. Generated {new Date(data.generatedAt).toLocaleDateString()}. {data.answered} of {data.expected} checklist
            questions answered.
          </p>
        </div>
        <div className="no-print">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            Print or save as PDF
          </Button>
        </div>
      </header>

      <Section title="1. Summary by function" intro="Percent is Yes over the questions that apply; Not applicable is left out, unanswered counts against the score.">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Function', 'Yes', 'In progress', 'No', 'Not applicable', 'Not answered', 'Percent'].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.functions.map((f) => (
              <tr key={f.label}>
                <td className={td}>{f.label}</td>
                {[f.yes, f.inProgress, f.no, f.notApplicable, f.unanswered].map((n, i) => (
                  <td key={i} className={`${td} tabular-nums`}>
                    {n}
                  </td>
                ))}
                <td className={`${td} tabular-nums`}>{f.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="2. Assessment report" intro="Every question of EPA's checklist with the recorded answer. EPA priority practices are marked.">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Item', 'Question', 'Answer', 'Note'].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q) => (
              <tr key={q.identifier}>
                <td className={`${td} whitespace-nowrap`}>
                  {q.identifier}
                  {q.priority ? ' (priority)' : ''}
                </td>
                <td className={td}>
                  {q.question}
                  <div className="text-xs text-muted-foreground">{q.function}</div>
                </td>
                <td className={`${td} whitespace-nowrap`}>{answerLabel(q.answer)}</td>
                <td className={td}>{[q.justification, q.note].filter(Boolean).join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="3. Risk mitigation plan"
        intro={`Every No and In progress, EPA priority practices first. The action is the note recorded with the answer; the owner and status come from the evidence task of the CPG goal.${unanswered > 0 ? ` ${unanswered} questions are not answered yet and are not listed.` : ''}`}
      >
        {gaps.length === 0 ? (
          <p className="text-sm">No gaps recorded.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Item', 'Practice', 'Status', 'CPG 2.0 goal', 'Planned action', 'Owner', 'Evidence task'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaps.map((q) => (
                <tr key={q.identifier}>
                  <td className={`${td} whitespace-nowrap`}>
                    {q.identifier}
                    {q.priority ? ' (priority)' : ''}
                  </td>
                  <td className={td}>{q.question}</td>
                  <td className={`${td} whitespace-nowrap`}>{answerLabel(q.answer)}</td>
                  <td className={td}>{q.goal}</td>
                  <td className={td}>{q.note ?? ''}</td>
                  <td className={td}>{q.evidence?.owner ?? ''}</td>
                  <td className={td}>
                    {q.evidence ? `${q.evidence.status.replace('_', ' ')}, ${q.evidence.attachments} attached` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="4. Plans">
        <ul className="space-y-1 text-sm">
          {data.plans.map((p) => (
            <li key={p.name}>
              {p.name.split(' (')[0]}: {p.status.replace('_', ' ')}, {p.total > 0 ? Math.round((p.filled / p.total) * 100) : 0}% of the requested information
              filled in ({p.filled} of {p.total})
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="5. Tabletop after-action report"
        intro={
          cadence.lastHeldOn
            ? `Last exercise ${cadence.lastHeldOn}; next due ${cadence.nextDue}${cadence.overdue ? ' (overdue)' : ''}, every ${cadence.cadenceMonths} months.`
            : 'No tabletop exercise has been held yet.'
        }
      >
        {session && (
          <div className="space-y-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Exercise</dt>
              <dd>{session.title}</dd>
              <dt className="text-muted-foreground">Scenario</dt>
              <dd className="whitespace-pre-line">{session.scenario ?? ''}</dd>
              <dt className="text-muted-foreground">Facilitator</dt>
              <dd>{session.facilitator ?? ''}</dd>
              <dt className="text-muted-foreground">Participants</dt>
              <dd className="whitespace-pre-line">{session.participants ?? ''}</dd>
            </dl>
            {session.topics.length > 0 && (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Topic', 'Discussion', 'Gaps and follow-up actions'].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {session.topics.map((t) => (
                    <tr key={t.title}>
                      <td className={td}>{t.title}</td>
                      <td className={`${td} whitespace-pre-line`}>{t.discussion}</td>
                      <td className={`${td} whitespace-pre-line`}>{t.gaps ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">After-action summary</h3>
              <p className="whitespace-pre-line text-sm">{session.afterAction ?? ''}</p>
            </div>
          </div>
        )}
      </Section>

      <p className="text-xs text-muted-foreground">
        Sources: EPA Water Cybersecurity Assessment Tool 3.1, CISA Cross-Sector Cybersecurity Performance Goals 2.0, CISA tabletop exercise
        package for the water sector. Crosswalk and report by BomberJacket Networks.
      </p>
    </div>
  );
}
