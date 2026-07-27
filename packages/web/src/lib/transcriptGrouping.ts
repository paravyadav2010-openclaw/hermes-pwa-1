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
  const add = (value: string | undefined) => {
    const cleaned = value?.trim();
    if (cleaned && !parts.includes(cleaned)) parts.push(cleaned);
  };

  for (const message of messages) {
    const messageParts = message.thinkingParts?.map((part) => part.trim()).filter(Boolean) ?? [];
    for (const part of messageParts) add(part);

    const single = message.thinking?.trim();
    // History normalization may mirror thinkingParts into thinking by joining
    // them. Keep a distinct stream chunk, but never render that mirror twice.
    if (single && single !== messageParts.join('\n\n') && !messageParts.includes(single)) add(single);
  }
  return parts;
}
