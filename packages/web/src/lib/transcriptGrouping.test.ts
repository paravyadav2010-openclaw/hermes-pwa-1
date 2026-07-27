import { describe, expect, it } from 'vitest';
import { collectThinkingParts, groupTranscript, joinAssistantText } from './transcriptGrouping';
import type { Message } from '@hermes-pwa/core';

const msg = (partial: Partial<Message> & Pick<Message, 'id' | 'role' | 'text'>): Message => ({
  createdAt: undefined,
  ...partial,
});

describe('groupTranscript', () => {
  it('groups consecutive assistant messages into one turn', () => {
    const items = groupTranscript([
      msg({ id: 'u1', role: 'user', text: 'hi' }),
      msg({ id: 'a1', role: 'assistant', text: 'partial', toolCalls: [{ id: 't1', name: 'terminal' }] }),
      msg({ id: 'a2', role: 'assistant', text: 'final answer', thinking: 'reason' }),
      msg({ id: 'u2', role: 'user', text: 'next' }),
    ]);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ type: 'single' });
    expect(items[1]).toMatchObject({ type: 'assistant_turn' });
    if (items[1]?.type === 'assistant_turn') {
      expect(items[1].messages.map((m) => m.id)).toEqual(['a1', 'a2']);
    }
    expect(items[2]).toMatchObject({ type: 'single' });
  });

  it('joins assistant text and collects thinking for bottom prose layout', () => {
    const batch = [
      msg({ id: 'a1', role: 'assistant', text: 'First bit', thinking: 'step 1' }),
      msg({
        id: 'a2',
        role: 'assistant',
        text: 'Second bit',
        thinkingParts: ['step 2'],
        toolCalls: [{ id: 't1', name: 'read_file', output: 'ok' }],
      }),
    ];
    expect(joinAssistantText(batch)).toBe('First bit\n\nSecond bit');
    expect(collectThinkingParts(batch)).toEqual(['step 1', 'step 2']);
  });

  it('preserves a distinct thinking stream chunk alongside normalized parts', () => {
    const batch = [
      msg({
        id: 'a1',
        role: 'assistant',
        text: '',
        thinkingParts: ['first thought'],
        thinking: 'latest thought',
      }),
    ];

    expect(collectThinkingParts(batch)).toEqual(['first thought', 'latest thought']);
  });

  it('does not repeat a normalized thinkingParts mirror', () => {
    const batch = [
      msg({
        id: 'a1',
        role: 'assistant',
        text: '',
        thinkingParts: ['first thought', 'second thought'],
        thinking: 'first thought\n\nsecond thought',
      }),
    ];

    expect(collectThinkingParts(batch)).toEqual(['first thought', 'second thought']);
  });
});
