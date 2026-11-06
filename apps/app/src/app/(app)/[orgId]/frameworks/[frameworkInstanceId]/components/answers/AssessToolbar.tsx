'use client';

import type { useFrameworkAnswers } from '@/hooks/use-framework-answers';
import { DOMAIN_LABELS } from '@/types/framework-answers';
import { Button, Text } from '@trycompai/design-system';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type AnswersApi = ReturnType<typeof useFrameworkAnswers>;

/** Progress line, IT/OT domain choice, and CSET JSON import/export. */
export function AssessToolbar({
  frameworkInstanceId,
  answers,
  canAnswer,
}: {
  frameworkInstanceId: string;
  answers: AnswersApi;
  canAnswer: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const data = answers.data;
  if (!data) return null;
  const { profile, domains, chosenDomains } = data;
  const answeredCount = data.answers.length;

  async function onImportFile(file: File) {
    setBusy(true);
    try {
      const payload: unknown = JSON.parse(await file.text());
      const result = await answers.importCset(payload);
      toast.success(
        `Imported ${result.imported} answers from ${file.name}` +
          (result.unmatched.length ? `; ${result.unmatched.length} CSET items not in this framework` : ''),
      );
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onExport() {
    setBusy(true);
    try {
      const payload = await answers.exportCset();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `framework-answers-${frameworkInstanceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function chooseDomains(next: Array<'it' | 'ot'>) {
    try {
      await answers.saveDomains(next);
    } catch (err) {
      toast.error(`Could not change domains: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  const bothChosen = chosenDomains.length === 0 || chosenDomains.length === 2;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card p-3">
      <Text size="sm" variant="muted">
        Answers: {profile.answerOptions.join(' / ')}. {answeredCount} saved.
        {profile.domainMode === 'it_ot' && ' Answered per technology domain.'}
      </Text>
      {profile.domainMode === 'it_ot' && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Domains assessed">
          {(['both', 'it', 'ot'] as const).map((opt) => {
            const active = opt === 'both' ? bothChosen : !bothChosen && chosenDomains.includes(opt);
            const label = opt === 'both' ? 'IT + OT' : DOMAIN_LABELS[opt];
            return (
              <Button
                key={opt}
                size="sm"
                variant={active ? 'default' : 'outline'}
                role="radio"
                aria-checked={active}
                disabled={!canAnswer}
                onClick={() => void chooseDomains(opt === 'both' ? ['it', 'ot'] : [opt])}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
          }}
        />
        {canAnswer && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            Import CSET JSON
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onExport()}>
          Export CSET JSON
        </Button>
      </div>
      <div className="w-full">
        <Text size="sm" variant="muted">
          {domains.length > 1 ? 'Each goal is answered for IT and OT. ' : ''}
          Yes and Alternate count as met; Not applicable needs a justification and is left out of the score.
        </Text>
      </div>
    </div>
  );
}
