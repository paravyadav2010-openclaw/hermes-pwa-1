import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolGroup } from './ToolGroup';
import type { RpcClient } from '@hermes-pwa/core';

const rpcMock = { request: vi.fn(), onFrame: vi.fn(), events: new EventTarget() } as unknown as RpcClient;

describe('ToolGroup', () => {
  it('renders finished tools as individual compact rows and expands row detail', () => {
    const { container } = render(
      <ToolGroup
        rpc={rpcMock}
        tools={[{ id: 't1', name: 'terminal', input: { command: 'pytest -k reconnect' }, output: '2 passed' }]}
      />,
    );
    expect(screen.queryByText('Tool actions')).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Ran command.*pytest -k reconnect/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.hm-tool-group__row-detail')).not.toBeNull();
  });

  it('auto-opens while streaming with a running tool', () => {
    render(<ToolGroup rpc={rpcMock} tools={[{ id: 't1', name: 'search_files', input: { path: 'src' } }]} streaming />);
    expect(screen.getByText('Searching files')).toBeInTheDocument();
  });

  it('expands a tool row to show output', () => {
    render(
      <ToolGroup rpc={rpcMock} tools={[{ id: 't1', name: 'terminal', input: { command: 'ls' }, output: 'file.txt' }]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ran command.*ls/i }));
    expect(screen.getAllByText('file.txt').length).toBeGreaterThanOrEqual(1);
  });

  it('removes the compact run constraint when a row is expanded', () => {
    const { container } = render(
      <ToolGroup
        rpc={rpcMock}
        tools={[
          { id: 't1', name: 'terminal', input: { command: 'one' }, output: 'one result' },
          { id: 't2', name: 'terminal', input: { command: 'two' }, output: 'two result' },
          { id: 't3', name: 'terminal', input: { command: 'three' }, output: 'three result' },
        ]}
      />,
    );
    expect(container.querySelector('.hm-tool-group')).toHaveClass('hm-tool-group--bounded');

    fireEvent.click(screen.getByRole('button', { name: /Ran command.*one/i }));

    expect(container.querySelector('.hm-tool-group')).not.toHaveClass('hm-tool-group--bounded');
    expect(container.querySelector('.hm-tool-group__row-output')).toHaveTextContent('one result');
  });

  it('keeps terminal commands in the secondary line and output behind the disclosure', () => {
    render(
      <ToolGroup
        rpc={rpcMock}
        tools={[{ id: 't-command', name: 'terminal', input: { command: 'git status --short' }, output: 'M app.tsx' }]}
      />,
    );

    expect(screen.getByRole('button', { name: /Ran command.*git status --short/i })).toBeInTheDocument();
    expect(screen.queryByText('M app.tsx')).not.toBeInTheDocument();
  });
});
