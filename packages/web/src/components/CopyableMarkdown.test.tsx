import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MARKDOWN_COMPONENTS } from './MessageBubble.helpers';

describe('copyable markdown chips', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders inline code as a tap-to-copy control', async () => {
    render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {'Path is `/private/tmp/handoff.md` and done.'}
      </ReactMarkdown>,
    );

    const chip = screen.getByRole('button', { name: /Copy \/private\/tmp\/handoff\.md/i });
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/private/tmp/handoff.md');
    });
    expect(await screen.findByRole('button', { name: /^Copied$/i })).toBeInTheDocument();
  });

  it('renders fenced code blocks with a Copy control that copies full text', async () => {
    render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {'```bash\necho hello\n```'}
      </ReactMarkdown>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Copy code/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('echo hello');
    });
  });
});
