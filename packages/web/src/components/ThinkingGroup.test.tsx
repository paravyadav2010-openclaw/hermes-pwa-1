import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveThinking, ThinkingGroup } from './ThinkingGroup';
import { ThinkingDisclosure } from './ThinkingDisclosure';

describe('ThinkingGroup', () => {
  it('collapses settled thoughts behind a header and expands one-by-one', () => {
    render(<ThinkingGroup parts={['first plan', 'second plan']} />);

    const header = screen.getByRole('button', { name: /2 thoughts/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('first plan')).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');

    const thought1 = screen.getByRole('button', { name: /Thought 1/i });
    expect(screen.queryByText('first plan')).not.toBeInTheDocument();
    fireEvent.click(thought1);
    expect(screen.getByText('first plan')).toBeInTheDocument();
  });

  it('renders live thinking outside the history group and lets the user collapse it', () => {
    const { container } = render(<LiveThinking text="streaming reason" />);
    expect(container.querySelector('.hm-thinking--live')).not.toBeNull();
    expect(container.querySelector('[data-hm-thinking-live="1"]')).not.toBeNull();
    expect(screen.getByText('streaming reason')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thoughts/i })).not.toBeInTheDocument();
    const latest = screen.getByRole('button', { name: /Thinking/i });
    expect(latest).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(latest);
    expect(latest).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('streaming reason')).not.toBeInTheDocument();
  });

  it('always stays collapsed regardless of streaming', () => {
    const { container } = render(<ThinkingGroup parts={['active plan']} streaming />);
    const header = screen.getByRole('button', { name: /Thinking/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('active plan')).not.toBeInTheDocument();
    expect(container.querySelector('.hm-thinking-group--collapsed')).toBeTruthy();
  });
});

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
