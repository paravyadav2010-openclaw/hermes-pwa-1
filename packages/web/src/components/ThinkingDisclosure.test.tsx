import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThinkingDisclosure } from './ThinkingDisclosure';

describe('ThinkingDisclosure', () => {
  it('renders markdown when expanded instead of raw preformatted syntax', () => {
    render(<ThinkingDisclosure text={'**Plan**\n\n- [x] first step'} />);

    fireEvent.click(screen.getByRole('button', { name: /Thinking/i }));

    expect(screen.getByRole('strong')).toHaveTextContent('Plan');
    expect(screen.getByText('first step')).toBeInTheDocument();
    expect(screen.queryByText('**Plan**')).not.toBeInTheDocument();
    expect(document.querySelector('.hm-thinking__body pre')).toBeNull();
  });
});