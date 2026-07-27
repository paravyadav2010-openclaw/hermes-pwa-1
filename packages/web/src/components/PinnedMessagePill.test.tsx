import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PinnedMessagePill, pinnedMessagePreview } from './PinnedMessagePill';

describe('PinnedMessagePill', () => {
  it('sanitizes and truncates a pinned preview', () => {
    expect(pinnedMessagePreview('**Plan**\nMEDIA:/tmp/photo.png\n@file:/tmp/data.csv')).toBe('Plan [media] [file]');
    expect(pinnedMessagePreview('x'.repeat(120))).toHaveLength(112);
  });

  it('opens the pinned message and can unpin it', () => {
    const onOpen = vi.fn();
    const onUnpin = vi.fn();
    render(<PinnedMessagePill message={{ id: 'm-1', preview: 'Keep this answer handy' }} onOpen={onOpen} onUnpin={onUnpin} />);

    fireEvent.click(screen.getByRole('button', { name: /Open pinned message/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpin message' }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onUnpin).toHaveBeenCalledOnce();
  });
});
