'use client';

import { useVoiceGuide } from '@/hooks/use-voice-guide';
import { Button } from '@trycompai/design-system';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PageGuidance } from './guidance-plans';

/**
 * Orientation for the current wizard page. On screen: what the page is for and the
 * steps to take. By voice, when voice guidance is on: a fuller explanation of the
 * purpose, the parts of the screen and what happens next, spoken on each new page.
 * The spoken text can always be read under "Read the full explanation".
 */
export function VoiceDirection({ guidance }: { guidance: PageGuidance }) {
  // One switch: on speaks this page now and every page after; off stops it mid-sentence.
  const { supported, on, setOn, speak } = useVoiceGuide();
  const [showText, setShowText] = useState(false);
  const { about, steps, narration } = guidance;

  useEffect(() => {
    if (on) speak(narration);
  }, [on, narration, speak]);

  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What this page is for</div>
          <p className="text-sm leading-relaxed">{about}</p>
        </div>
        {supported && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant={on ? 'default' : 'outline'} onClick={() => setOn(!on)} aria-pressed={on}>
              {on ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}
              Voice guidance {on ? 'on' : 'off'}
            </Button>
            {on && (
              <Button size="sm" variant="outline" onClick={() => speak(narration)}>
                Repeat
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What to do now</div>
        <ol className="ml-5 list-decimal space-y-0.5 text-sm leading-relaxed">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      <button type="button" className="text-xs text-primary underline underline-offset-2" onClick={() => setShowText((v) => !v)}>
        {showText ? 'Hide the full explanation' : 'Read the full explanation'}
      </button>
      {showText && <p className="text-sm leading-relaxed text-muted-foreground">{narration}</p>}
    </div>
  );
}
