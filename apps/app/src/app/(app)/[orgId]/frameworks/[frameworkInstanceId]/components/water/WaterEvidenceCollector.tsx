'use client';

import { useTaskMutations } from '@/hooks/use-task-mutations';
import { useTaskAttachmentActions, useTaskAttachments } from '@/hooks/use-tasks-api';
import { useWaterEvidence, type WaterEvidenceTask } from '@/hooks/use-water-wizards';
import { ANSWER_LABELS, type AnswerValue } from '@/types/framework-answers';
import { Badge, Button, Text } from '@trycompai/design-system';
import { CheckCircle2, Circle, CircleDot, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { evidenceGuidance } from './guidance-steps';
import { VoiceDirection } from './VoiceDirection';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

const STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const;

function TaskIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (status === 'todo') return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <CircleDot className="h-4 w-4 shrink-0 text-amber-500" />;
}

function Attachments({ taskId, canEdit, onChanged }: { taskId: string; canEdit: boolean; onChanged: () => void }) {
  const { data, mutate } = useTaskAttachments(taskId);
  const { uploadAttachment, getDownloadUrl } = useTaskAttachmentActions(taskId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files = data?.data ?? [];

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) await uploadAttachment(file);
      await mutate();
      onChanged();
      toast.success(list.length === 1 ? 'Evidence attached' : `${list.length} files attached`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach the file');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const open = async (attachmentId: string) => {
    try {
      window.open(await getDownloadUrl(attachmentId), '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the file');
    }
  };

  return (
    <div className="space-y-2">
      <Text size="sm" variant="muted">
        Evidence attached ({files.length})
      </Text>
      {files.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <button type="button" className="truncate text-left text-primary hover:underline" onClick={() => void open(f.id)}>
                {f.name}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy} loading={busy}>
            <Paperclip className="mr-1 h-4 w-4" />
            Attach evidence
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Evidence collection one CPG goal per page: what to collect, the checklist answers
 * it supports, the files attached to the goal's evidence task, and the task status.
 */
export function WaterEvidenceCollector({ orgId, frameworkInstanceId, canEdit, onChanged }: Props) {
  const { tasks, error, isLoading, refresh } = useWaterEvidence(frameworkInstanceId);
  const { updateTask } = useTaskMutations();
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  if (error) return <Text variant="muted">The evidence tasks could not be loaded: {error.message}</Text>;
  if (isLoading) return <Text variant="muted">Loading the evidence tasks…</Text>;
  const task: WaterEvidenceTask | undefined = tasks[index];
  if (!task) return <Text variant="muted">No evidence tasks yet. They are created when the framework is added.</Text>;

  const changed = () => {
    void refresh();
    onChanged?.();
  };

  const setStatus = async (status: (typeof STATUSES)[number]['value']) => {
    setSaving(true);
    try {
      await updateTask(task.taskId, { status });
      changed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the task');
    } finally {
      setSaving(false);
    }
  };

  const guidance = evidenceGuidance({
    index,
    total: tasks.length,
    title: task.title,
    attachments: task.attachments,
    questions: task.questions.length,
  });

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection guidance={guidance} />
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <ol className="max-h-[32rem] space-y-1 overflow-y-auto">
          {tasks.map((t, i) => (
            <li key={t.taskId}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50 ${i === index ? 'bg-muted font-medium' : ''}`}
              >
                <TaskIcon status={t.status} />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.attachments > 0 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t.attachments}</span>}
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{task.title}</h3>
            <Link href={`/${orgId}/tasks/${task.taskId}`} className="text-xs text-primary underline underline-offset-2">
              Open the task
            </Link>
          </div>
          <div className="space-y-2 rounded-md bg-muted/30 p-3">
            <Text size="sm" variant="muted">
              What to collect
            </Text>
            {task.description.map((p, i) => (
              <p key={i} className="whitespace-pre-line text-sm leading-relaxed">
                {p}
              </p>
            ))}
          </div>
          {task.questions.length > 0 && (
            <div className="space-y-1">
              <Text size="sm" variant="muted">
                Checklist answers this evidence supports
              </Text>
              <ul className="space-y-1">
                {task.questions.map((q) => (
                  <li key={q.identifier} className="flex items-start justify-between gap-3 text-sm">
                    <span>{q.name}</span>
                    <Badge variant={q.answer ? 'secondary' : 'outline'}>
                      {q.answer ? (q.answer === 'incomplete' ? 'In progress' : ANSWER_LABELS[q.answer as AnswerValue]?.label ?? q.answer) : 'Not answered'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Attachments key={task.taskId} taskId={task.taskId} canEdit={canEdit} onChanged={changed} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)} disabled={index === 0}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIndex(index + 1)} disabled={index >= tasks.length - 1}>
                Next
              </Button>
            </div>
            {canEdit && (
              <div className="flex gap-2" role="radiogroup" aria-label="Task status">
                {STATUSES.map((s) => (
                  <Button
                    key={s.value}
                    size="sm"
                    variant={task.status === s.value ? 'default' : 'outline'}
                    role="radio"
                    aria-checked={task.status === s.value}
                    disabled={saving}
                    onClick={() => void setStatus(s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
