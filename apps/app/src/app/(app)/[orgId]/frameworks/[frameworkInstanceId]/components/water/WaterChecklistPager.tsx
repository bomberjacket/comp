'use client';

import { useFrameworkAnswers } from '@/hooks/use-framework-answers';
import { ANSWER_LABELS, NEEDS_JUSTIFICATION, type AnswerValue } from '@/types/framework-answers';
import type { FrameworkEditorRequirement } from '@db';
import { Badge, Button, Text, Textarea } from '@trycompai/design-system';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { groupByFamily } from '../answers/AssessTab';
import { VoiceDirection } from './VoiceDirection';

const PRIORITY_MARK = '(EPA priority cybersecurity practice)';
/** EPA's wording for the checklist: "In progress" rather than CSET's "Incomplete". */
const LABEL: Partial<Record<AnswerValue, string>> = { incomplete: 'In progress' };
const labelOf = (v: AnswerValue) => LABEL[v] ?? ANSWER_LABELS[v].label;

interface Props {
  frameworkInstanceId: string;
  requirementDefinitions: FrameworkEditorRequirement[];
  canEdit: boolean;
  onChanged?: () => void;
}

/**
 * EPA's checklist one question per page: the question, EPA's fact sheet text, the
 * answer, an optional note, then on to the next. Saves through the same answers API
 * as the Assess tab, so both always agree.
 */
export function WaterChecklistPager({ frameworkInstanceId, requirementDefinitions, canEdit, onChanged }: Props) {
  const api = useFrameworkAnswers(frameworkInstanceId);
  const questions = useMemo(() => groupByFamily(requirementDefinitions).flatMap((g) => g.items), [requirementDefinitions]);
  const [index, setIndex] = useState<number | null>(null);
  const [choice, setChoice] = useState<AnswerValue | null>(null);
  const [justification, setJustification] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const domain = api.data?.domains[0] ?? 'all';
  const byReq = useMemo(() => {
    const m = new Map<string, NonNullable<typeof api.data>['answers'][number]>();
    for (const a of api.data?.answers ?? []) if (a.requirementId && a.domain === domain) m.set(a.requirementId, a);
    return m;
  }, [api.data, domain]);

  // Open on the first unanswered question.
  useEffect(() => {
    if (index !== null || !api.data || questions.length === 0) return;
    const first = questions.findIndex((q) => !byReq.has(q.id));
    setIndex(first === -1 ? 0 : first);
  }, [index, api.data, questions, byReq]);

  const q = index === null ? undefined : questions[index];
  const saved = q ? byReq.get(q.id) : undefined;

  useEffect(() => {
    setChoice(saved?.answer ?? null);
    setJustification(saved?.justification ?? '');
    setNote(saved?.comment ?? '');
  }, [q?.id, saved?.answer, saved?.justification, saved?.comment]);

  const direction = useMemo(() => {
    if (!q || index === null) return '';
    const text = q.name.replace(/^\S+\s/, '');
    const first =
      'Read the question and the fact sheet text under it. Choose Yes when the practice is fully in place, In progress when it is partly in place, No when it is not or you do not know, and Not applicable only with a reason. Add a note on what you saw, then choose Save and next.';
    return `Question ${index + 1} of ${questions.length}, in ${q.requirementFamily ?? 'the checklist'}. ${text} ${index === 0 ? first : 'Choose the answer, add a note if useful, then Save and next.'}`;
  }, [q, index, questions.length]);

  if (api.isLoading || index === null) return <Text variant="muted">Loading the checklist…</Text>;
  if (!api.data || !q) return <Text variant="muted">The checklist could not be loaded.</Text>;

  const answered = questions.filter((x) => byReq.has(x.id)).length;
  const needsReason = choice !== null && NEEDS_JUSTIFICATION.has(choice);
  const dirty =
    choice !== (saved?.answer ?? null) || note.trim() !== (saved?.comment ?? '') || justification.trim() !== (saved?.justification ?? '');
  const canSave = canEdit && choice !== null && dirty && (!needsReason || justification.trim().length > 0);
  const nextUnanswered = questions.findIndex((x, i) => i !== index && !byReq.has(x.id));
  const priority = (q.description ?? '').includes(PRIORITY_MARK);

  const save = async (thenNext: boolean) => {
    if (!choice) return;
    setSaving(true);
    try {
      await api.saveAnswers([
        { requirementId: q.id, domain, answer: choice, comment: note.trim(), justification: needsReason ? justification.trim() : undefined },
      ]);
      onChanged?.();
      toast.success(`${q.identifier} saved`);
      if (thenNext && index < questions.length - 1) setIndex(index + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection direction={direction} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          Question {index + 1} of {questions.length}
        </Badge>
        <Badge variant="outline">{q.requirementFamily ?? 'Checklist'}</Badge>
        {priority && <Badge variant="default">EPA priority practice</Badge>}
        <span className="text-xs tabular-nums text-muted-foreground">{answered} answered</span>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-semibold">{q.name}</h3>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{q.description}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Answer">
        {api.data.profile.answerValues.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={v === choice ? 'default' : 'outline'}
            role="radio"
            aria-checked={v === choice}
            disabled={!canEdit || saving}
            onClick={() => setChoice(v)}
          >
            {labelOf(v)}
          </Button>
        ))}
      </div>

      {needsReason && (
        <Textarea
          value={justification}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJustification(e.target.value)}
          placeholder="Why this practice does not apply to the utility (required)"
          rows={2}
          disabled={!canEdit || saving}
        />
      )}
      <Textarea
        value={note}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
        placeholder="Note: what was seen, who was asked, what is still to do"
        rows={3}
        disabled={!canEdit || saving}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)} disabled={index === 0 || dirty}>
            Previous
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIndex(index + 1)} disabled={index >= questions.length - 1 || dirty}>
            Next
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIndex(nextUnanswered)} disabled={nextUnanswered === -1 || dirty}>
            Next unanswered
          </Button>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void save(false)} disabled={!canSave || saving} loading={saving}>
              Save
            </Button>
            <Button size="sm" onClick={() => void save(true)} disabled={!canSave || saving}>
              Save and next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
