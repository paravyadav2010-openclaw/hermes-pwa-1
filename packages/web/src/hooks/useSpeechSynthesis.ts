import { useCallback, useRef } from 'react';

/**
 * Hook that provides browser-native text-to-speech via the Web Speech API.
 * On iOS, uses the system voice (free, on-device, private).
 */
export function useSpeechSynthesis() {
  const speakingRef = useRef(false);

  const isSupported = typeof window !== 'undefined' && !!window.speechSynthesis;

  /** Speak text aloud. Returns a promise that resolves when done or on error. */
  const speak = useCallback(
    (text: string, lang = 'en-US', rate = 1.0): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (!isSupported) {
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;
        utterance.volume = 1;

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          speakingRef.current = false;
          resolve();
        };

        utterance.onend = finish;
        utterance.onerror = finish;

        speakingRef.current = true;
        window.speechSynthesis.speak(utterance);
      });
    },
    [isSupported],
  );

  /** Immediately stop any in-progress speech. */
  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    speakingRef.current = false;
  }, [isSupported]);

  /**
   * Prime the speech engine. On iOS, calling speak() with a silent utterance
   * inside a user-gesture handler unlocks audio for later programmatic use.
   */
  const prime = useCallback(() => {
    if (!isSupported) return;
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  return { speak, cancel, prime, isSupported, speaking: speakingRef.current };
}
