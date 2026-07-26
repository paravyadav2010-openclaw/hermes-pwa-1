import { useEffect, useRef, useState } from 'react';
import { useMicRecorder } from './useMicRecorder';

export type VoiceRecorderStatus = 'idle' | 'recording' | 'transcribing';

export interface VoiceRecorderState {
  status: VoiceRecorderStatus;
  elapsedSeconds: number;
  level: number;
}

interface VoiceRecorderOptions {
  maxRecordingSeconds?: number;
  onTranscribeAudio?: ((audio: Blob) => Promise<string>) | undefined;
  onTranscript?: ((text: string) => void) | undefined;
  onFocusInput?: (() => void) | undefined;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export function useVoiceRecorder({
  maxRecordingSeconds = 120,
  onTranscribeAudio,
  onTranscript,
  onFocusInput,
}: VoiceRecorderOptions) {
  const { handle, level, recording } = useMicRecorder();
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => () => clearTimers(), []);

  const stop = async () => {
    clearTimers();
    const result = await handle.stop();
    if (!result) {
      setStatus('idle');
      return;
    }
    if (!onTranscribeAudio) {
      setStatus('idle');
      return;
    }
    setStatus('transcribing');
    try {
      const transcript = (await onTranscribeAudio(result.audio)).trim();
      if (transcript) {
        onTranscript?.(transcript);
      }
    } finally {
      setStatus('idle');
      onFocusInput?.();
    }
  };

  const start = async () => {
    if (!onTranscribeAudio) return;
    try {
      await handle.start({
        onError: () => {
          setStatus('idle');
          clearTimers();
        },
      });
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStatus('recording');
      intervalRef.current = window.setInterval(
        () => setElapsedSeconds((Date.now() - startedAtRef.current) / 1000),
        250,
      );
      const cap = Math.max(1, Math.min(Math.trunc(maxRecordingSeconds), 600));
      timeoutRef.current = window.setTimeout(() => void stop(), cap * 1000);
    } catch {
      setStatus('idle');
    }
  };

  /**
   * Use browser SpeechRecognition directly (iOS/macOS dictation, Chrome Web Speech).
   * Bypasses MediaRecorder so the user gesture reaches SpeechRecognition.start()
   * immediately — avoids the "gesture expired after async mic release" deadlock.
   */
  const dictateWithSpeech = () => {
    const SpeechCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechCtor) return false;

    setStatus('transcribing');
    const recognition = new SpeechCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const finish = (text: string) => {
      setStatus('idle');
      try { recognition.abort(); } catch { /* already done */ }
      if (text && onTranscript) {
        onTranscript(text);
      }
      onFocusInput?.();
    };

    const timeout = setTimeout(() => finish(''), 15000);

    recognition.onresult = (event: any) => {
      clearTimeout(timeout);
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      finish(transcript.trim());
    };

    recognition.onerror = () => {
      clearTimeout(timeout);
      finish('');
    };

    recognition.onend = () => {
      clearTimeout(timeout);
      // If onresult fired, finish() already handled it.
      // If onend fires without onresult (user cancelled, no speech), settle here.
      if (status !== 'transcribing') return; // already settled via onresult
      finish('');
    };

    try {
      recognition.start();
      return true;
    } catch {
      clearTimeout(timeout);
      setStatus('idle');
      return false;
    }
  };

  const dictate = () => {
    if (recording) {
      void stop();
    } else if (status === 'idle') {
      // Prefer SpeechRecognition — starts within the user gesture, no mic conflict.
      if (dictateWithSpeech()) return;
      // Fall back to MediaRecorder blob-based recording.
      void start();
    }
  };

  return { dictate, status, elapsedSeconds, level };
}
