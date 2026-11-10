'use client';

import { useWaterTabletop, type TabletopInput } from '@/hooks/use-water-wizards';
import { Badge, Button, Input, Text, Textarea } from '@trycompai/design-system';
import { CheckCircle2, Circle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { tabletopGuidance } from './guidance-steps';
import { Field, toDraft, today, type Draft } from './tabletop-draft';
import { VoiceDirection } from './VoiceDirection';

interface Props {
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

/**
 * Tabletop session recorder: set the session up, walk one topic per page with its CISA
 * questions, write the after-action summary, record the session as held. The next
 * exercise comes due on the cadence; held sessions stay as the history.
 */
export function WaterTabletopRecorder({ frameworkInstanceId, canEdit, onChanged }: Props) {
  const { data, error, isLoading, save, remove } = useWaterTabletop(frameworkInstanceId);
  const [sessionId, setSessionId] = useState<string | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sessions = data?.sessions ?? [];
  const topics = data?.topics ?? [];
  // undefined = not chosen yet: open the newest planned session, else a new one.
  const activeId = sessionId === undefined ? (sessions.find((s) => s.status === 'planned')?.id ?? null) : sessionId;
  const session = sessions.find((s) => s.id === activeId);
  const cadenceMonths = data?.cadence.cadenceMonths ?? 12;

  useEffect(() => {
    if (!data) return;
    setDraft(toDraft(session, cadenceMonths));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, !!data]);

  const lastPage = topics.length + 1;
  const topic = page >= 1 && page <= topics.length ? topics[page - 1] : undefined;

  const guidance = useMemo(
    () =>
      tabletopGuidance({
        page: page === 0 ? 'setup' : topic ? 'topic' : 'after',
        topicIndex: page - 1,
        topics: topics.length,
        topicTitle: topic?.title,
      }),
    [page, topic, topics.length],
  );

  if (error) return <Text variant="muted">The tabletop could not be loaded: {error.message}</Text>;
  if (isLoading || !data || !draft) return <Text variant="muted">Loading the tabletop…</Text>;

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const setNote = (taskId: string, patch: Partial<{ discussion: string; gaps: string }>) => {
    const current = draft.notes[taskId] ?? { discussion: '', gaps: '' };
    set({ notes: { ...draft.notes, [taskId]: { ...current, ...patch } } });
  };

  const persist = async (status: 'planned' | 'held', thenNext: boolean) => {
    if (!draft.title.trim()) return toast.error('Give the session a title');
    if (status === 'held' && !draft.heldOn) return toast.error('Enter the date the session was held');
    const input: TabletopInput = {
      title: draft.title,
      scenario: draft.scenario || undefined,
      status,
      scheduledFor: draft.scheduledFor || undefined,
      heldOn: draft.heldOn || undefined,
      facilitator: draft.facilitator || undefined,
      participants: draft.participants || undefined,
      cadenceMonths: draft.cadenceMonths,
      afterAction: draft.afterAction || undefined,
      notes: Object.entries(draft.notes).map(([taskId, n]) => ({ taskId, discussion: n.discussion, gaps: n.gaps || undefined })),
    };
    setSaving(true);
    try {
      const saved = await save(activeId, input);
      if (!activeId) setSessionId(saved.sessions[0]?.id ?? null);
      setDirty(false);
      onChanged?.();
      toast.success(status === 'held' ? 'Session recorded as held' : 'Session saved');
      if (thenNext && page < lastPage) setPage(page + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the session');
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!activeId) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setConfirmDelete(false);
    setSaving(true);
    try {
      await remove(activeId);
      setSessionId(null);
      setPage(0);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the session');
    } finally {
      setSaving(false);
    }
  };

  const status = session?.status ?? 'planned';
  const { cadence } = data;
  const text = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.value;
  const locked = !canEdit || saving;
  const pages = ['Session setup', ...topics.map((t) => t.title), 'After-action summary'];
  const pageDone = (i: number) =>
    i === 0 ? !!session : i === lastPage ? !!draft.afterAction.trim() : !!draft.notes[topics[i - 1].taskId]?.discussion.trim();

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection guidance={guidance} />
      <div className="flex flex-wrap items-center gap-2">
        {sessions.map((s) => (
          <Button key={s.id} size="sm" variant={s.id === activeId ? 'default' : 'outline'} disabled={dirty} onClick={() => { setSessionId(s.id); setPage(0); }}>
            {s.title} ({s.status === 'held' ? `held ${s.heldOn}` : 'planned'})
          </Button>
        ))}
        {canEdit && (
          <Button size="sm" variant={activeId ? 'outline' : 'default'} disabled={dirty} onClick={() => { setSessionId(null); setPage(0); }}>
            New session
          </Button>
        )}
        <Badge variant={cadence.overdue ? 'destructive' : 'secondary'}>
          {cadence.lastHeldOn ? `Last held ${cadence.lastHeldOn}, next due ${cadence.nextDue}${cadence.overdue ? ' (overdue)' : ''}` : 'No session held yet'}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <ol className="max-h-[32rem] space-y-1 overflow-y-auto">
          {pages.map((label, i) => (
            <li key={`${i}-${label}`}>
              <button
                type="button"
                onClick={() => setPage(i)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50 ${i === page ? 'bg-muted font-medium' : ''}`}
              >
                {pageDone(i) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          <h3 className="text-base font-semibold">{pages[page]}</h3>
          {page === 0 && (
            <div className="space-y-3">
              <Field label="Title">
                <Input value={draft.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ title: text(e) })} disabled={locked} />
              </Field>
              <Field label="Scenario: the incident the group walks through">
                <Textarea value={draft.scenario} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set({ scenario: text(e) })} rows={4} disabled={locked} />
              </Field>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Planned for">
                  <Input type="date" value={draft.scheduledFor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ scheduledFor: text(e) })} disabled={locked} />
                </Field>
                <Field label="Facilitator">
                  <Input value={draft.facilitator} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ facilitator: text(e) })} disabled={locked} />
                </Field>
                <Field label="Months until the next exercise">
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    value={String(draft.cadenceMonths)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ cadenceMonths: Math.min(36, Math.max(1, Number(text(e)) || 12)) })}
                    disabled={locked}
                  />
                </Field>
              </div>
              <Field label="Participants: names and roles">
                <Textarea value={draft.participants} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set({ participants: text(e) })} rows={3} disabled={locked} />
              </Field>
            </div>
          )}
          {topic && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-md bg-muted/30 p-3">
                {topic.groups.map((g) => (
                  <div key={g.heading} className="space-y-1">
                    <Text size="sm" variant="muted">
                      {g.heading}
                    </Text>
                    <ul className="space-y-1">
                      {g.questions.map((question, i) => (
                        <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
                          {question}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Field label="Discussion: what the group said">
                <Textarea value={draft.notes[topic.taskId]?.discussion ?? ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(topic.taskId, { discussion: text(e) })} rows={6} disabled={locked} />
              </Field>
              <Field label="Gaps and follow-up actions">
                <Textarea value={draft.notes[topic.taskId]?.gaps ?? ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(topic.taskId, { gaps: text(e) })} rows={3} disabled={locked} />
              </Field>
            </div>
          )}
          {page === lastPage && (
            <div className="space-y-3">
              <Field label="After-action summary">
                <Textarea value={draft.afterAction} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set({ afterAction: text(e) })} rows={8} disabled={locked} />
              </Field>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Date held">
                  <Input type="date" value={draft.heldOn} max={today()} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ heldOn: text(e) })} disabled={locked} />
                </Field>
                {canEdit && (
                  <Button size="sm" onClick={() => void persist('held', false)} disabled={saving || (!dirty && status === 'held')}>
                    {status === 'held' ? 'Update held session' : 'Record as held'}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(page - 1)} disabled={page === 0}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(page + 1)} disabled={page >= lastPage}>
                Next
              </Button>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {activeId && (
                  <Button size="sm" variant="ghost" onClick={() => void discard()} disabled={saving}>
                    {confirmDelete ? 'Confirm delete' : 'Delete session'}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void persist(status, false)} disabled={!dirty || saving} loading={saving}>
                  Save
                </Button>
                {page < lastPage && (
                  <Button size="sm" onClick={() => void persist(status, true)} disabled={!dirty || saving}>
                    Save and next
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
