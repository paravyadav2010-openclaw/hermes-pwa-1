import { useRef, useState } from 'react';
import { useMicRecorder } from './useMicRecorder';

export type VoiceRecorderStatus = 'idle' | 'recording' | 'transcribing' | 'unsupported';

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

/** Check if the browser likely supports mic capture (needs HTTPS or localhost). */
function canUseMic(): boolean {
  if (typeof navigator === 'undefined') return false;
  // getUserMedia exists in secure contexts only
  if (!navigator.mediaDevices?.getUserMedia) return false;
  // On iOS, getUserMedia only works over HTTPS (or localhost)
  // Quick check: if protocol is http and host isn't localhost, it won't work
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

/** Check if SpeechRecognition is available. */
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
  const [interimText, setInterimText] = useState('');
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
      // Can't use mic — focus input so iOS keyboard dictation takes over
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
      // Mic access denied or unavailable — focus input for keyboard dictation
      setStatus('idle');
      onFocusInput?.();
    }
  };

  const dictateWithSpeech = () => {
    if (!hasSpeechRecognition()) return false;

    setStatus('transcribing');
    setInterimText('');
    const SpeechCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;  // word-by-word like native iOS dictation
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    const finish = (text: string) => {
      setStatus('idle');
      setInterimText('');
      try { recognition.abort(); } catch { /* already done */ }
      if (text && onTranscript) {
        onTranscript(text);
      }
      onFocusInput?.();
    };

    let timeout = setTimeout(() => finish(''), 15000);

    recognition.onresult = (event: any) => {
      clearTimeout(timeout);
      // Show interim results in real-time; commit only when final
      const result = event.results[event.results.length - 1];
      const transcript = (result[0]?.transcript ?? '').trim();
      if (result.isFinal) {
        finish(transcript);
      } else {
        setInterimText(transcript);
        // Reset timeout on each interim result
        timeout = setTimeout(() => {
          // If we have interim text but no final after timeout, commit what we have
          finish(transcript);
        }, 3000);
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

    // 1. Try SpeechRecognition (needs HTTPS + supported browser)
    if (dictateWithSpeech()) return;

    // 2. Try MediaRecorder (needs HTTPS or localhost)
    if (canUseMic()) {
      void startRecording();
      return;
    }

    // 3. Neither available — focus input so iOS keyboard dictation works
    onFocusInput?.();
  };

  return { dictate, status, elapsedSeconds, level, interimText };
}
