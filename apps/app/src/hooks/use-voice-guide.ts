'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'wizard-voice-guidance';
const listeners = new Set<() => void>();
let enabled: boolean | null = null;

function read(): boolean {
  if (enabled === null) {
    try {
      enabled = window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(next: boolean) {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // private window or blocked storage: the choice lasts for this page only
  }
  for (const l of listeners) l();
}

/**
 * Spoken directions for the wizards, using the browser's own speech engine (no service,
 * nothing leaves the machine). The on/off choice is shared by every wizard on the page
 * and remembered per browser.
 */
export function useVoiceGuide() {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  const setOn = useCallback(
    (next: boolean) => {
      write(next);
      if (!next) stop();
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { supported, on, setOn, speak, stop };
}
