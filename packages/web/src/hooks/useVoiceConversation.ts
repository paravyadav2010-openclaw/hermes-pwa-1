import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@hermes-pwa/core';
import { useMicRecorder } from './useMicRecorder';

export type ConversationStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export interface VoiceConversationOptions {
  enabled: boolean;
  busy: boolean;
  messages: Message[];
  onSubmit: (text: string) => void;
  onTranscribeAudio?: ((audio: Blob) => Promise<string>) | undefined;
  onSpeakText?: ((text: string) => Promise<void>) | undefined;
  onStopSpeech?: (() => void) | undefined;
  onPrimeAudio?: (() => void) | undefined;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function hasSpeechRecognition(): boolean {
  return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function useVoiceConversation({
  enabled,
  busy,
  messages,
  onSubmit,
  onTranscribeAudio,
  onSpeakText,
  onStopSpeech,
  onPrimeAudio,
}: VoiceConversationOptions) {
  const { handle, level } = useMicRecorder();
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [interimText, setInterimText] = useState('');
  const turnClosingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const mutedRef = useRef(muted);
  const busyRef = useRef(busy);
  const statusRef = useRef<ConversationStatus>('idle');
  const messagesRef = useRef(messages);
  const pendingTurnRef = useRef<{ assistantIdsBefore: Set<string> } | null>(null);
  const spokenRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const useSpeechRef = useRef(hasSpeechRecognition());

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { useSpeechRef.current = hasSpeechRecognition(); }, []);

  // ===== Speech Recognition mode (preferred on HTTPS/iOS) =====

  const submitTranscript = useCallback((transcript: string) => {
    if (!transcript) return;
    setInterimText('');
    pendingTurnRef.current = {
      assistantIdsBefore: new Set(
        messagesRef.current.filter((m) => m.role === 'assistant').map((m) => m.id),
      ),
    };
    onSubmit(transcript);
    setStatus('thinking');
  }, [onSubmit]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const startSpeechListening = useCallback(() => {
    if (!enabledRef.current || mutedRef.current || busyRef.current) return;
    if (!useSpeechRef.current) return;

    stopSpeechRecognition();

    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastInterim = '';

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript = (result[0]?.transcript ?? '').trim();
      lastInterim = transcript;

      if (silenceTimer) clearTimeout(silenceTimer);

      if (result.isFinal) {
        stopSpeechRecognition();
        setStatus('transcribing');
        // Brief pause to show the text before sending
        setTimeout(() => submitTranscript(transcript), 300);
      } else {
        setInterimText(transcript);
        setStatus('listening');
        silenceTimer = setTimeout(() => {
          stopSpeechRecognition();
          setStatus('transcribing');
          setTimeout(() => submitTranscript(lastInterim), 300);
          lastInterim = '';
        }, 1500);
      }
    };

    recognition.onerror = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      stopSpeechRecognition();
      setInterimText('');
      setStatus('idle');
    };

    recognition.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setStatus('listening');
    } catch {
      setStatus('idle');
    }
  }, [stopSpeechRecognition, submitTranscript]);

  // ===== MediaRecorder fallback mode =====

  const handleTurn = useCallback(
    async (forceTranscribe = false) => {
      if (turnClosingRef.current) return;
      turnClosingRef.current = true;
      setStatus('transcribing');
      try {
        const result = await handle.stop();
        if (!result || (!result.heardSpeech && !forceTranscribe) || !onTranscribeAudio) {
          setStatus('idle');
          return;
        }
        try {
          const transcript = (await onTranscribeAudio(result.audio)).trim();
          if (!transcript) {
            setStatus('idle');
            return;
          }
          submitTranscript(transcript);
        } catch {
          setStatus('idle');
        }
      } finally {
        turnClosingRef.current = false;
      }
    },
    [handle, onTranscribeAudio, submitTranscript],
  );

  const startMicListening = useCallback(async () => {
    if (!enabledRef.current || mutedRef.current || busyRef.current) return;
    if (statusRef.current !== 'idle') return;
    if (!onTranscribeAudio) return;
    try {
      await handle.start({
        silenceLevel: 0.035,
        silenceMs: 1000,
        idleSilenceMs: 12000,
        onError: () => setStatus('idle'),
        onSilence: () => void handleTurn(),
      });
      if (!enabledRef.current || mutedRef.current || busyRef.current || statusRef.current !== 'idle') {
        handle.cancel();
        setStatus('idle');
        return;
      }
      setInterimText('');
      setStatus('listening');
    } catch {
      setStatus('idle');
    }
  }, [handle, handleTurn, onTranscribeAudio]);

  // ===== Lifecycle =====

  const end = useCallback(() => {
    pendingTurnRef.current = null;
    handle.cancel();
    stopSpeechRecognition();
    onStopSpeech?.();
    turnClosingRef.current = false;
    spokenRef.current = false;
    setMuted(false);
    setInterimText('');
    setStatus('idle');
  }, [handle, onStopSpeech, stopSpeechRecognition]);

  const start = useCallback(() => {
    if (!useSpeechRef.current && !onTranscribeAudio) {
      end();
      return;
    }
    onPrimeAudio?.();
    setMuted(false);
    spokenRef.current = false;
    setInterimText('');
    setStatus('idle');
    if (useSpeechRef.current) {
      startSpeechListening();
    } else {
      void startMicListening();
    }
  }, [end, onPrimeAudio, onTranscribeAudio, startSpeechListening, startMicListening]);

  const toggle = useCallback(() => {
    if (enabled) {
      end();
    } else {
      start();
    }
  }, [enabled, end, start]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      if (next) {
        handle.cancel();
        stopSpeechRecognition();
        onStopSpeech?.();
        setStatus('idle');
      }
      return next;
    });
  }, [handle, onStopSpeech, stopSpeechRecognition]);

  const stopTurn = useCallback(() => {
    if (statusRef.current === 'listening') {
      if (useSpeechRef.current) {
        stopSpeechRecognition();
        setStatus('transcribing');
      } else {
        void handleTurn(true);
      }
    }
  }, [handleTurn, stopSpeechRecognition]);

  useEffect(() => {
    if (!enabled) { end(); return; }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (statusRef.current !== 'listening') return;
      event.preventDefault();
      stopTurn();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [enabled, end, stopTurn]);

  // Detect Hermes reply → speak it → resume listening
  useEffect(() => {
    if (!enabled || muted) return;
    if (status !== 'thinking' || busy) return;

    const pending = pendingTurnRef.current;
    if (!pending) {
      setStatus('idle');
      return;
    }

    const assistantReply = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          !pending.assistantIdsBefore.has(message.id) &&
          Boolean(message.text.trim()),
      );
    const text = assistantReply?.text.trim();
    if (!text) return;

    pendingTurnRef.current = null;
    spokenRef.current = false;
    setStatus('speaking');
    void (async () => {
      try {
        spokenRef.current = true;
        if (onSpeakText) {
          await onSpeakText(text);
        }
      } finally {
        spokenRef.current = false;
        setStatus('idle');
      }
    })();
  }, [enabled, muted, status, busy, messages, onSpeakText]);

  // Resume listening after speaking or when idle
  useEffect(() => {
    if (!enabled || muted || busy || status !== 'idle') return;
    if (useSpeechRef.current) {
      startSpeechListening();
    } else {
      void startMicListening();
    }
  }, [enabled, muted, busy, status, startSpeechListening, startMicListening]);

  return { active: enabled, toggle, status, muted, toggleMute, level, stopTurn, interimText };
}
