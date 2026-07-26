import { useCallback } from 'react';

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

/**
 * Hook that provides browser-native speech-to-text via the Web Speech API.
 * On iOS Safari, this uses the built-in dictation engine — free, on-device, private.
 */
export function useSpeechRecognition() {
  const getRecognition = useCallback((): SpeechRecognition | null => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    return new Ctor();
  }, []);

  /**
   * Start recognition and return the first final transcript.
   * Times out after `timeoutMs` (default 15s) with an empty string.
   */
  const transcribe = useCallback(
    (timeoutMs = 15000): Promise<string> => {
      return new Promise<string>((resolve) => {
        const recognition = getRecognition();
        if (!recognition) {
          resolve('');
          return;
        }

        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        let settled = false;
        const finish = (text: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { recognition.abort(); } catch { /* already stopped */ }
          resolve(text);
        };

        const timeout = setTimeout(() => finish(''), timeoutMs);

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results?.[0]?.[0]?.transcript ?? '';
          finish(transcript.trim());
        };

        recognition.onerror = () => finish('');

        recognition.onend = () => {
          // If onresult fired, finish() already called. Otherwise timed out.
          if (!settled) finish('');
        };

        try {
          recognition.start();
        } catch {
          finish('');
        }
      });
    },
    [getRecognition],
  );

  return { transcribe, isSupported: !!getRecognition() };
}
