'use client';

import { useWaterPlans, type WaterPlan, type WaterPlanSection } from '@/hooks/use-water-program';
import { Badge, Button, Input, Text, Textarea } from '@trycompai/design-system';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { planGuidance } from './water/guidance-plans';
import { VoiceDirection } from './water/VoiceDirection';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
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

const valuesOf = (section: WaterPlanSection | undefined) => Object.fromEntries((section?.fields ?? []).map((f) => [f.label, f.value]));

/**
 * Section-by-section writer for the two water plans. Each section shows the standard
 * wording that is already in the plan, then one fill-in box per fact only the utility
 * knows. The boxes are saved into the plan under "Utility record" as labelled lines,
 * through the API, so the policy editor, the working draft and the version history
 * stay consistent. Publish when every box of every section is filled.
 */
export function WaterPlanWriter({ orgId, frameworkInstanceId, canEdit, onChanged }: Props) {
  const { plans, error, isLoading, saveSection, publish } = useWaterPlans(frameworkInstanceId);
  const [planKey, setPlanKey] = useState<WaterPlan['key']>('crmp');
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  const section: WaterPlanSection | undefined = plan?.sections[index];
  const savedKey = JSON.stringify([valuesOf(section), section?.notes ?? '']);

  useEffect(() => {
    setValues(valuesOf(section));
    setNotes(section?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, plan?.policyId, index]);

  if (error) return <Text variant="muted">The plans could not be loaded: {error.message}</Text>;
  if (isLoading || !plan || !section) return <Text variant="muted">Loading the plans…</Text>;

  const dirty = section.fields.some((f) => (values[f.label] ?? '').trim() !== f.value.trim()) || notes.trim() !== section.notes.trim();
  const filledNow = section.fields.filter((f) => (values[f.label] ?? '').trim()).length;
  const planName = plan.name.split(' (')[0] ?? plan.name;
  const guidance = planGuidance({
    planKey: plan.key,
    planName,
    index,
    total: plan.sections.length,
    sectionTitle: section.title,
    fieldCount: section.fields.length,
    written: plan.written,
    published: plan.status === 'published',
  });

  const save = async (thenNext: boolean) => {
    setSaving(true);
    try {
      await saveSection(plan.policyId, index, {
        fields: section.fields.map((f) => ({ label: f.label, value: (values[f.label] ?? '').trim() })),
        notes: notes.trim(),
      });
      onChanged?.();
      toast.success(`${section.title} saved`);
      if (thenNext && index < plan.sections.length - 1) setIndex(index + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    setSaving(true);
    try {
      await publish(plan.policyId);
      onChanged?.();
      toast.success(`${planName} published`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection guidance={guidance} />
      <div className="flex flex-wrap items-center gap-2">
        {plans.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={p.key === plan.key ? 'default' : 'outline'}
            onClick={() => {
              setPlanKey(p.key);
              setIndex(0);
            }}
            disabled={dirty}
          >
            {p.name.split(' (')[0]} ({p.written}/{p.total})
          </Button>
        ))}
        <Badge variant={plan.status === 'published' ? 'default' : 'secondary'}>{plan.status.replace('_', ' ')}</Badge>
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
                onClick={() => setIndex(s.index)}
                disabled={dirty && s.index !== index}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50 ${s.index === index ? 'bg-muted font-medium' : ''}`}
              >
                <SectionIcon section={s} />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {s.filled}/{s.fields.length}
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
              Your part: fill in each box for this utility ({filledNow} of {section.fields.length} filled)
            </Text>
            {section.fields.map((f) => (
              <label key={f.label} className="block space-y-1">
                <span className="text-sm font-medium">{f.label}</span>
                {f.long ? (
                  <Textarea
                    value={values[f.label] ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValues({ ...values, [f.label]: e.target.value })}
                    placeholder={f.hint}
                    rows={3}
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)} disabled={index === 0 || dirty}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIndex(index + 1)} disabled={index >= plan.sections.length - 1 || dirty}>
                Next
              </Button>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void save(false)} disabled={!dirty || saving} loading={saving}>
                  Save
                </Button>
                <Button size="sm" onClick={() => void save(true)} disabled={!dirty || saving}>
                  Save and next
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => void doPublish()}
                  disabled={saving || dirty || plan.written < plan.total || plan.status === 'published'}
                  title={plan.written < plan.total ? 'Fill in every box of every section first' : 'Publish this plan'}
                >
                  Publish plan
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
