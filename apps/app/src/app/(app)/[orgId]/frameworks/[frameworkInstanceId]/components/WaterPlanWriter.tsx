'use client';

import { useWaterPlans, type WaterPlan, type WaterPlanSection } from '@/hooks/use-water-program';
import { Badge, Button, Text, Textarea } from '@trycompai/design-system';
import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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

/**
 * Section-by-section writer for the two water plans: shows BNI's guidance for the
 * section, the "what to record" prompts, and a text box whose content becomes the
 * utility's record in the policy. Saves through the API so the policy editor, the
 * working draft and the version history stay consistent; publish when every section
 * is written.
 */
export function WaterPlanWriter({ orgId, frameworkInstanceId, canEdit, onChanged }: Props) {
  const { plans, error, isLoading, saveSection, publish } = useWaterPlans(frameworkInstanceId);
  const [planKey, setPlanKey] = useState<WaterPlan['key']>('crmp');
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  const section: WaterPlanSection | undefined = plan?.sections[index];

  useEffect(() => {
    setText(section?.record ?? '');
  }, [section?.record, plan?.policyId, index]);

  if (error) return <Text variant="muted">The plans could not be loaded: {error.message}</Text>;
  if (isLoading || !plan || !section) return <Text variant="muted">Loading the plans…</Text>;

  const dirty = text.trim() !== (section.record ?? '').trim();
  const planName = plan.name.split(' (')[0];
  const direction =
    plan.written === plan.total && plan.status !== 'published'
      ? `Every section of the ${planName} is written. Read it once more in the policy editor, then choose Publish plan.`
      : `${planName}, section ${index + 1} of ${plan.sections.length}: ${section.title.replace(/^\d+\.\s*/, '')}. Read the guidance, then answer each point under What to record here in the utility's own words. Leave a blank line between paragraphs. Choose Save and next when the section is written.`;

  const save = async (thenNext: boolean) => {
    setSaving(true);
    try {
      await saveSection(plan.policyId, index, text);
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
      toast.success(`${plan.name.split(' (')[0]} published`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <VoiceDirection direction={direction} />
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
                {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          <h3 className="text-base font-semibold">{section.title}</h3>
          <div className="space-y-2 rounded-md bg-muted/30 p-3">
            <Text size="sm" variant="muted">
              Guidance
            </Text>
            <ul className="space-y-1">
              {section.guidance.map((line, i) => (
                <GuidanceLine key={i} line={line} />
              ))}
            </ul>
          </div>
          {section.prompts.length > 0 && (
            <div className="space-y-1">
              <Text size="sm" variant="muted">
                What to record here
              </Text>
              <ul className="space-y-1">
                {section.prompts.map((p, i) => (
                  <li key={i} className="ml-4 list-disc text-sm">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Textarea
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            placeholder="The utility's own text for this section. Leave a blank line between paragraphs."
            rows={10}
            disabled={!canEdit || saving}
          />
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
                  title={plan.written < plan.total ? 'Write every section first' : 'Publish this plan'}
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
