'use client';

import { useVoiceGuide } from '@/hooks/use-voice-guide';
import { Button } from '@trycompai/design-system';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect } from 'react';

/**
 * The direction for the current wizard page: always shown as text, and spoken when
 * voice guidance is on. It speaks again whenever the direction changes (a new page),
 * and "Repeat" says it once more.
 */
export function VoiceDirection({ direction }: { direction: string }) {
  const { supported, on, setOn, speak } = useVoiceGuide();

  useEffect(() => {
    if (on) speak(direction);
  }, [on, direction, speak]);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-dashed bg-muted/20 p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What to do now</div>
        <p className="text-sm leading-relaxed">{direction}</p>
      </div>
      {supported && (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant={on ? 'default' : 'outline'} onClick={() => setOn(!on)} aria-pressed={on}>
            {on ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}
            Voice guidance {on ? 'on' : 'off'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => speak(direction)}>
            Repeat
          </Button>
        </div>
      )}
    </div>
  );
}
