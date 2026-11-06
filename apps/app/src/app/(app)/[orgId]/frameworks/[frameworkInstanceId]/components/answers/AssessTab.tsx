'use client';

import { useFrameworkAnswers, type AnswerInput } from '@/hooks/use-framework-answers';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ANSWER_LABELS,
  DOMAIN_LABELS,
  NEEDS_JUSTIFICATION,
  type AnswerDomain,
  type AnswerValue,
  type RequirementAnswerRow,
} from '@/types/framework-answers';
import type { FrameworkEditorRequirement } from '@db';
import { Button, Table, TableBody, TableCell, TableRow, Text, Textarea } from '@trycompai/design-system';
import { ChevronDown, ChevronRight } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExpandableDescription } from '../ExpandableDescription';
import { AnswerButtons } from './AnswerButtons';
import { AssessToolbar } from './AssessToolbar';

interface FamilyGroup {
  family: string;
  items: FrameworkEditorRequirement[];
}

/** Requirements in sortOrder, grouped by family in first-seen order. */
export function groupByFamily(requirements: FrameworkEditorRequirement[]): FamilyGroup[] {
  const sorted = [...requirements].sort(
    (a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.identifier.localeCompare(b.identifier),
  );
  const groups = new Map<string, FrameworkEditorRequirement[]>();
  for (const r of sorted) {
    const fam = r.requirementFamily ?? 'Other';
    groups.set(fam, [...(groups.get(fam) ?? []), r]);
  }
  return [...groups.entries()].map(([family, items]) => ({ family, items }));
}

export function answerKey(requirementId: string, domain: AnswerDomain): string {
  return `${requirementId}|${domain}`;
}

/**
 * Question-by-question answering for frameworks with an answer profile (CISA CSET
 * modules). One row per requirement; one answer per domain (IT and OT for CPG 2.0).
 * Each click saves immediately and moves the control's evidence task on the server.
 */
export function AssessTab({
  orgId,
  frameworkInstanceId,
  requirementDefinitions,
  onAnswersChanged,
}: {
  orgId: string;
  frameworkInstanceId: string;
  requirementDefinitions: FrameworkEditorRequirement[];
  onAnswersChanged?: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canAnswer = hasPermission('framework', 'update');
  const answersApi = useFrameworkAnswers(frameworkInstanceId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [pendingJustification, setPendingJustification] = useState<{
    requirementId: string;
    domain: AnswerDomain;
    answer: AnswerValue;
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const groups = useMemo(() => groupByFamily(requirementDefinitions), [requirementDefinitions]);
  const byKey = useMemo(() => {
    const m = new Map<string, RequirementAnswerRow>();
    for (const a of answersApi.data?.answers ?? []) if (a.requirementId) m.set(answerKey(a.requirementId, a.domain), a);
    return m;
  }, [answersApi.data]);

  if (answersApi.isLoading) return <Text variant="muted">Loading answers…</Text>;
  if (!answersApi.data) return <Text variant="muted">This framework is not answered question by question.</Text>;
  const { profile, domains } = answersApi.data;

  async function save(input: AnswerInput) {
    const key = answerKey(input.requirementId, input.domain ?? 'all');
    setSaving(key);
    try {
      await answersApi.saveAnswers([input]);
      onAnswersChanged?.();
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(null);
    }
  }

  function select(requirementId: string, domain: AnswerDomain, answer: AnswerValue) {
    const existing = byKey.get(answerKey(requirementId, domain));
    if (NEEDS_JUSTIFICATION.has(answer) && !existing?.justification) {
      setPendingJustification({ requirementId, domain, answer, text: '' });
      return;
    }
    void save({ requirementId, domain, answer, justification: existing?.justification ?? undefined });
  }

  function toggle(family: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <AssessToolbar frameworkInstanceId={frameworkInstanceId} answers={answersApi} canAnswer={canAnswer} />

      {pendingJustification && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <Text size="sm">
            {ANSWER_LABELS[pendingJustification.answer].label} needs a justification
            {pendingJustification.answer === 'alternate' ? ' (describe the compensating control)' : ''}.
          </Text>
          <Textarea
            autoFocus
            rows={3}
            value={pendingJustification.text}
            onChange={(e) => setPendingJustification({ ...pendingJustification, text: e.target.value })}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!pendingJustification.text.trim()}
              onClick={() => {
                const p = pendingJustification;
                setPendingJustification(null);
                void save({ requirementId: p.requirementId, domain: p.domain, answer: p.answer, justification: p.text.trim() });
              }}
            >
              Save answer
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPendingJustification(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableBody>
          {groups.map((g) => {
            const open = !collapsed.has(g.family);
            const answered = g.items.filter((r) => domains.every((d) => byKey.has(answerKey(r.id, d)))).length;
            const Chevron = open ? ChevronDown : ChevronRight;
            return [
              <TableRow key={`fam-${g.family}`} onClick={() => toggle(g.family)} style={{ cursor: 'pointer' }}>
                <TableCell colSpan={3 + domains.length}>
                  <div className="flex items-center gap-2">
                    <Chevron size={16} />
                    <span className="font-medium">{g.family}</span>
                    <Text size="sm" variant="muted">
                      {answered}/{g.items.length} answered
                    </Text>
                  </div>
                </TableCell>
              </TableRow>,
              ...(open
                ? g.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell style={{ width: '7rem', verticalAlign: 'top' }}>
                        <Link href={`/${orgId}/frameworks/${frameworkInstanceId}/requirements/${r.id}`} className="pl-6 text-sm">
                          {r.identifier || '—'}
                        </Link>
                      </TableCell>
                      <TableCell style={{ verticalAlign: 'top', whiteSpace: 'normal' }}>
                        <div className="text-sm">{r.name}</div>
                        <ExpandableDescription description={r.description} identifier={r.identifier} name={r.name} />
                        {noteFor === r.id && (
                          <NoteEditor
                            rows={domains.map((d) => byKey.get(answerKey(r.id, d))).filter((x): x is RequirementAnswerRow => !!x)}
                            onSave={(comment) =>
                              Promise.all(
                                domains
                                  .map((d) => byKey.get(answerKey(r.id, d)))
                                  .filter((x): x is RequirementAnswerRow => !!x)
                                  .map((a) => save({ requirementId: r.id, domain: a.domain, answer: a.answer, justification: a.justification ?? undefined, comment })),
                              ).then(() => setNoteFor(null))
                            }
                            onClose={() => setNoteFor(null)}
                          />
                        )}
                      </TableCell>
                      {domains.map((d) => {
                        const a = byKey.get(answerKey(r.id, d));
                        return (
                          <TableCell key={d} style={{ width: '11rem', verticalAlign: 'top', whiteSpace: 'normal' }}>
                            {domains.length > 1 && (
                              <Text size="sm" variant="muted">
                                {DOMAIN_LABELS[d]}
                              </Text>
                            )}
                            <AnswerButtons
                              values={profile.answerValues}
                              selected={a?.answer ?? null}
                              disabled={!canAnswer || saving === answerKey(r.id, d)}
                              onSelect={(v) => select(r.id, d, v)}
                            />
                            {a?.justification && (
                              <Text size="sm" variant="muted">
                                {a.justification}
                              </Text>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell style={{ width: '5rem', verticalAlign: 'top' }}>
                        {domains.some((d) => byKey.has(answerKey(r.id, d))) && (
                          <Button size="sm" variant="ghost" onClick={() => setNoteFor(noteFor === r.id ? null : r.id)}>
                            {domains.some((d) => byKey.get(answerKey(r.id, d))?.comment) ? 'Note ✎' : 'Note'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                : []),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function NoteEditor({
  rows,
  onSave,
  onClose,
}: {
  rows: RequirementAnswerRow[];
  onSave: (comment: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(rows.find((r) => r.comment)?.comment ?? '');
  return (
    <div className="mt-2 space-y-2">
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Assessor note (evidence seen, who was interviewed, follow-ups)" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void onSave(text.trim())}>
          Save note
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
