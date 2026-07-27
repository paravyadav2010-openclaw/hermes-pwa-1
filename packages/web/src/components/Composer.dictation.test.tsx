import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Composer } from './Composer';

const mocks = vi.hoisted(() => ({
  voiceRecorder: {
    dictate: vi.fn(),
    status: 'idle' as 'idle' | 'recording' | 'transcribing',
    elapsedSeconds: 0,
    level: 0,
    interimText: '',
  },
  voiceConversation: {
    active: false,
    toggle: vi.fn(),
    status: 'idle' as 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking',
    muted: false,
    toggleMute: vi.fn(),
    level: 0,
    stopTurn: vi.fn(),
  },
}));

vi.mock('../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => mocks.voiceRecorder,
}));

vi.mock('../hooks/useVoiceConversation', () => ({
  useVoiceConversation: () => mocks.voiceConversation,
}));

describe('Composer dictation status', () => {
  beforeEach(() => {
    mocks.voiceRecorder.dictate.mockClear();
    mocks.voiceRecorder.status = 'idle';
    mocks.voiceRecorder.elapsedSeconds = 0;
    mocks.voiceRecorder.level = 0;
    mocks.voiceRecorder.interimText = '';
    mocks.voiceConversation.active = false;
    mocks.voiceConversation.status = 'idle';
  });

  it('replaces the mic with an in-place wave control while recording', () => {
    mocks.voiceRecorder.status = 'recording';

    const { container } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />);

    expect(screen.getByRole('button', { name: 'Stop dictation' })).toBeEnabled();
    expect(container.querySelectorAll('.hm-composer__action--dictating .hm-composer__voice-level')).toHaveLength(5);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the wave control tappable to cancel speech dictation', () => {
    mocks.voiceRecorder.status = 'transcribing';

    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />);

    const stopButton = screen.getByRole('button', { name: 'Stop dictation' });
    expect(stopButton).toBeEnabled();
    fireEvent.click(stopButton);
    expect(mocks.voiceRecorder.dictate).toHaveBeenCalledTimes(1);
  });
});
