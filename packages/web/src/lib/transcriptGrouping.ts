import type { Message } from '@hermes-pwa/core';

export type TranscriptItem =
  | { type: 'single'; message: Message; index: number }
  | { type: 'assistant_turn'; messages: Message[]; startIndex: number; endIndex: number };

/**
 * Group consecutive assistant rows into one turn so the UI can render
 * thinking/tools first and all reply prose underneath (never interleaved).
 */
export function groupTranscript(messages: Message[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const message = messages[i];
    if (!message) break;

    if (message.role === 'tool' || message.role === 'system') {
      i += 1;
      continue;
    }

    if (message.role === 'assistant') {
      const startIndex = i;
      const batch: Message[] = [];
      while (i < messages.length && messages[i]?.role === 'assistant') {
        batch.push(messages[i]!);
        i += 1;
      }
      out.push({ type: 'assistant_turn', messages: batch, startIndex, endIndex: i - 1 });
      continue;
    }

    out.push({ type: 'single', message, index: i });
    i += 1;
  }
  return out;
}

export function joinAssistantText(messages: Message[]): string {
  return messages
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function collectThinkingParts(messages: Message[]): string[] {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.thinkingParts && message.thinkingParts.length > 0) {
      for (const part of message.thinkingParts) {
        const cleaned = part.trim();
        if (cleaned) parts.push(cleaned);
      }
      continue;
    }
    const single = message.thinking?.trim();
    if (single) parts.push(single);
  }
  return parts;
}
