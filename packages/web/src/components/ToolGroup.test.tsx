import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolGroup } from './ToolGroup';
import type { RpcClient } from '@hermes-pwa/core';

const rpcMock = { request: vi.fn(), onFrame: vi.fn(), events: new EventTarget() } as unknown as RpcClient;

describe('ToolGroup', () => {
  it('renders finished tools as single-line desktop-style titles and expands detail', () => {
    const { container } = render(
      <ToolGroup
        rpc={rpcMock}
        tools={[{ id: 't1', name: 'terminal', input: { command: 'pytest -k reconnect' }, output: '2 passed' }]}
      />,
    );
    expect(screen.queryByText('Tool actions')).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Ran · pytest -k reconnect/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.hm-tool-group__row-main')).toBeNull();

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.hm-tool-group__row-detail')).not.toBeNull();
  });

  it('uses gateway context labels without doubling the verb', () => {
    render(
      <ToolGroup
        rpc={rpcMock}
        tools={[
          { id: 't1', name: 'terminal', input: { context: "Running echo hi" }, output: 'hi' },
          { id: 't2', name: 'read_file', input: { context: 'Reading service-worker.js' }, output: 'ok' },
          { id: 't3', name: 'search_files', input: { context: 'Searching files for reconnecting' }, output: '[]' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /^Ran echo hi$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Read service-worker\.js$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Searched files for reconnecting$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Ran · Running/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Read Reading/i)).not.toBeInTheDocument();
  });

  it('auto-opens while streaming with a running tool', () => {
    render(<ToolGroup rpc={rpcMock} tools={[{ id: 't1', name: 'search_files', input: { path: 'src' } }]} streaming />);
    expect(screen.getByText(/Searching/i)).toBeInTheDocument();
  });

  it('embeds read_file path in the single-line title', () => {
    render(
      <ToolGroup
        rpc={rpcMock}
        tools={[{ id: 't1', name: 'read_file', input: { path: '/tmp/example.ts' }, output: 'export const x = 1' }]}
      />,
    );
    expect(screen.getByRole('button', { name: /Read \/tmp\/example\.ts/i })).toBeInTheDocument();
  });

  it('keeps terminal commands in the title and output behind the disclosure', () => {
    render(
      <ToolGroup
        rpc={rpcMock}
        tools={[{ id: 't-command', name: 'terminal', input: { command: 'git status --short' }, output: 'M app.tsx' }]}
      />,
    );

    expect(screen.getByRole('button', { name: /Ran · git status --short/i })).toBeInTheDocument();
    expect(screen.queryByText('M app.tsx')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Ran · one/i }));

    expect(container.querySelector('.hm-tool-group')).not.toHaveClass('hm-tool-group--bounded');
    expect(container.querySelector('.hm-tool-group__row-output')).toHaveTextContent('one result');
  });
});
