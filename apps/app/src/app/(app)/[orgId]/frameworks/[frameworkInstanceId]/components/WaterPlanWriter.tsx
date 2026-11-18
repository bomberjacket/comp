'use client';

import { useWaterPlans, type WaterPlan, type WaterPlanSection } from '@/hooks/use-water-program';
import { Badge, Button, Input, Text, Textarea } from '@trycompai/design-system';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { planGuidance } from './water/guidance-plans';
import { PlanWriterFooter, PublishConfirm } from './water/PlanWriterFooter';
import { VoiceDirection } from './water/VoiceDirection';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
  /** The Who's who list: how complete it is, and how to open it. */
  roster?: { filled: number; total: number; onOpen: () => void };
}

function GuidanceLine({ line }: { line: string }) {
  const isBullet = line.startsWith('- ') || /^\d+\. /.test(line);
  return isBullet ? (
    <li className="ml-4 list-disc text-sm leading-relaxed">{line.replace(/^(- |\d+\. )/, '')}</li>
  ) : (
    <p className="text-sm leading-relaxed">{line}</p>
  );
}

function SectionIcon({ section }: { section: WaterPlanSection }) {
  if (section.done) return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (section.filled > 0 || section.notes) return <CircleDot className="h-4 w-4 shrink-0 text-amber-500" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/** Box contents on opening a section: the saved value, or the platform's starting list for an empty prefill box. */
const valuesOf = (section: WaterPlanSection | undefined) =>
  Object.fromEntries((section?.fields ?? []).map((f) => [f.label, f.value || f.suggestion || '']));

/**
 * Section-by-section writer for the two water plans. Each section shows the standard
 * wording that is already in the plan, then one fill-in box per fact only the utility
 * knows. The boxes are saved into the plan under "Utility record" as labelled lines,
 * through the API, so the policy editor, the working draft and the version history
 * stay consistent. Moving between sections saves by itself; the last section leads to
 * publishing, and then to the other plan.
 */
export function WaterPlanWriter({ orgId, frameworkInstanceId, canEdit, onChanged, roster }: Props) {
  const { plans, error, isLoading, saveSection, publish } = useWaterPlans(frameworkInstanceId);
  const [planKey, setPlanKey] = useState<WaterPlan['key'] | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  // Until a plan is picked, open the first one that is not published yet.
  const plan = plans.find((p) => p.key === planKey) ?? plans.find((p) => p.status !== 'published') ?? plans[0];
  const section: WaterPlanSection | undefined = plan?.sections[index];
  const savedKey = JSON.stringify([valuesOf(section), section?.notes ?? '']);

  useEffect(() => {
    setValues(valuesOf(section));
    setNotes(section?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, plan?.policyId, index]);

  // A new section or plan starts at its top; without this the page stays scrolled at the buttons and looks unchanged.
  useEffect(() => {
    if (moved.current) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    moved.current = true;
  }, [plan?.policyId, index]);

  if (error) return <Text variant="muted">The plans could not be loaded: {error.message}</Text>;
  if (isLoading || !plan || !section) return <Text variant="muted">Loading the plans…</Text>;

  const typed = (f: WaterPlanSection['fields'][number]) => (values[f.label] ?? '').trim();
  // An untouched starting list is not an edit: it does not block moving on, but Save stores it.
  const dirty = section.fields.some((f) => !f.auto && typed(f) !== f.value.trim() && typed(f) !== (f.suggestion ?? '').trim()) || notes.trim() !== section.notes.trim();
  const canSave = dirty || section.fields.some((f) => !!f.suggestion && typed(f) === f.suggestion.trim());
  const filledNow = section.fields.filter((f) => !f.optional && (f.auto ? !f.auto.startsWith('roster_') || f.value.trim() : (values[f.label] ?? '').trim())).length;
  const planName = plan.name.split(' (')[0] ?? plan.name;
  const percent = plan.totalFields > 0 ? Math.round((plan.filledFields / plan.totalFields) * 100) : 0;
  const incomplete = plan.sections.filter((s) => !s.done);
  const guidance = planGuidance({
    planKey: plan.key,
    planName,
    index,
    total: plan.sections.length,
    sectionTitle: section.title,
    fieldCount: section.fields.length,
    written: plan.written,
    published: plan.status === 'published',
    publishPercent: confirmPublish ? percent : undefined,
  });

  const otherPlan = plans.find((p) => p.key !== plan.key && p.status !== 'published');

  const persist = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await saveSection(plan.policyId, index, {
        fields: section.fields.filter((f) => !f.auto).map((f) => ({ label: f.label, value: (values[f.label] ?? '').trim() })),
        notes: notes.trim(),
      });
      onChanged?.();
      toast.success(`${section.title} saved`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Leaving a section saves what was typed; going forward also keeps an untouched starting list. */
  const leave = async (forward: boolean): Promise<boolean> => !canEdit || !(forward ? canSave : dirty) || persist();
  const go = async (target: number, forward = false) => {
    if (await leave(forward)) setIndex(target);
  };
  const switchPlan = async (key: WaterPlan['key']) => {
    if (!(await leave(false))) return;
    setPlanKey(key);
    setIndex(0);
  };
  const askPublish = async () => {
    if (await leave(true)) setConfirmPublish(true);
  };

  const doPublish = async () => {
    setConfirmPublish(false);
    setSaving(true);
    try {
      await publish(plan.policyId);
      onChanged?.();
      toast.success(percent < 100 ? `${planName} published with ${percent}% of the requested information` : `${planName} published`);
      // On to the plan that is still unpublished; with none left, stay on this one.
      setPlanKey(otherPlan?.key ?? plan.key);
      if (otherPlan) setIndex(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={top} className="scroll-mt-4 space-y-4 rounded-lg border p-4">
      <VoiceDirection guidance={guidance} />
      <div className="flex flex-wrap items-center gap-2">
        {roster && (
          <Button size="sm" variant="outline" onClick={() => void leave(false).then((ok) => ok && roster.onOpen())} disabled={saving}>
            1. Who&apos;s who and vendors ({roster.filled}/{roster.total})
          </Button>
        )}
        {plans.map((p, n) => (
          <Button
            key={p.key}
            size="sm"
            variant={p.key === plan.key ? 'default' : 'outline'}
            onClick={() => void switchPlan(p.key)}
            disabled={saving}
          >
            {roster ? `${n + 2}. ` : ''}
            {p.name.split(' (')[0]} ({p.written}/{p.total}){p.status === 'published' ? ', published' : ''}
          </Button>
        ))}
        <Badge variant={plan.status === 'published' ? 'default' : 'secondary'}>{plan.status.replace('_', ' ')}</Badge>
        <Badge variant="outline">
          {percent}% filled in ({plan.filledFields} of {plan.totalFields} boxes)
        </Badge>
        <Link href={`/${orgId}/policies/${plan.policyId}`} className="text-xs text-primary underline underline-offset-2">
          Open in the policy editor
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <ol className="space-y-1">
          {plan.sections.map((s) => (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => void go(s.index)}
                disabled={saving}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50 ${s.index === index ? 'bg-muted font-medium' : ''}`}
              >
                <SectionIcon section={s} />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {s.filled}/{s.total}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-4">
          <h3 className="text-base font-semibold">{section.title}</h3>
          <div className="space-y-2 rounded-md bg-muted/30 p-3">
            <Text size="sm" variant="muted">
              Standard wording, already in the plan. Read it; you do not retype it.
            </Text>
            <ul className="space-y-1">
              {section.guidance.map((line, i) => (
                <GuidanceLine key={i} line={line} />
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <Text size="sm" variant="muted">
              Your part: fill in each box for this utility ({filledNow} of {section.total} filled)
            </Text>
            {section.fields.map((f) => (
              <label key={f.label} className="block space-y-1">
                <span className="text-sm font-medium">{f.label}</span>
                {f.auto ? (
                  <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
                    {f.value || 'Not filled in yet.'}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {f.auto.startsWith('roster_')
                        ? "From the Who's who list, so it is the same in both plans. To change it, open Who's who at the top."
                        : 'Filled in by the platform from its own records. Nothing to type.'}
                    </div>
                  </div>
                ) : f.long ? (
                  <Textarea
                    value={values[f.label] ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValues({ ...values, [f.label]: e.target.value })}
                    placeholder={f.hint}
                    rows={f.suggestion ? Math.min(10, Math.max(3, f.suggestion.split('\n').length + 1)) : 3}
                    disabled={!canEdit || saving}
                  />
                ) : (
                  <Input
                    value={values[f.label] ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [f.label]: e.target.value })}
                    placeholder={f.hint}
                    disabled={!canEdit || saving}
                  />
                )}
                {f.suggestion && (
                  <span className="block text-xs text-muted-foreground">
                    {f.prefill === 'vendor_scorers'
                      ? 'Started from who has saved a procurement score sheet in this platform. Change it to the people or roles responsible, then save.'
                      : 'Started from the Vendors page of this platform. Remove any that have no access, add what each can reach, then save.'}
                  </span>
                )}
              </label>
            ))}
            <label className="block space-y-1">
              <span className="text-sm font-medium">Additional notes (optional)</span>
              <Textarea
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="Anything else this section should say about the utility. Leave a blank line between paragraphs."
                rows={3}
                disabled={!canEdit || saving}
              />
            </label>
          </div>

          <PlanWriterFooter
            canEdit={canEdit}
            saving={saving}
            isFirst={index === 0}
            isLast={index >= plan.sections.length - 1}
            published={plan.status === 'published'}
            hasChanges={canEdit && canSave}
            nextPlanName={otherPlan?.name.split(' (')[0]}
            onPrevious={() => void go(index - 1)}
            onContinue={() => void go(index + 1, true)}
            onSave={() => void persist()}
            onPublish={() => void askPublish()}
            onNextPlan={() => otherPlan && void switchPlan(otherPlan.key)}
          />

          {confirmPublish && (
            <PublishConfirm
              percent={percent}
              filled={plan.filledFields}
              total={plan.totalFields}
              incomplete={incomplete}
              saving={saving}
              onBack={() => {
                setConfirmPublish(false);
                if (incomplete[0]) setIndex(incomplete[0].index);
              }}
              onPublish={() => void doPublish()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
