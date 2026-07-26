import { useCallback, useEffect, useRef, useState } from 'react';
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

function canUseMic(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return false;
  }
  return true;
}

function hasSpeechRecognition(): boolean {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return !!Ctor;
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

  const startRecording = async () => {
    if (!onTranscribeAudio) return;
    if (!canUseMic()) {
      onFocusInput?.();
      return;
    }
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
      onFocusInput?.();
    }
  };

  const dictateWithSpeech = () => {
    if (!hasSpeechRecognition()) return false;

    setStatus('transcribing');
    const SpeechCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;  // word-by-word like native iOS dictation
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    const finish = (text: string) => {
      setStatus('idle');
      try { recognition.abort(); } catch { /* already done */ }
      if (text && onTranscript) {
        onTranscript(text);
      }
      onFocusInput?.();
    };

    let timeout = setTimeout(() => finish(''), 15000);

    recognition.onresult = (event: any) => {
      clearTimeout(timeout);
      const result = event.results[event.results.length - 1];
      const transcript = (result[0]?.transcript ?? '').trim();
      if (result.isFinal) {
        finish(transcript);
      } else {
        // Stream interim results directly into the composer via onTranscript
        onTranscript?.(transcript);
        timeout = setTimeout(() => finish(transcript), 3000);
      }
    };

    recognition.onerror = () => {
      clearTimeout(timeout);
      finish('');
    };

    recognition.onend = () => {
      clearTimeout(timeout);
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
      return;
    }
    if (status !== 'idle') return;

    if (dictateWithSpeech()) return;

    if (canUseMic()) {
      void startRecording();
      return;
    }

    onFocusInput?.();
  };

  return { dictate, status, elapsedSeconds, level };
}
