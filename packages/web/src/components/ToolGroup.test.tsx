import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ToolGroup } from './ToolGroup';
import type { RpcClient } from '@hermes-pwa/core';

const rpcMock = { request: vi.fn(), onFrame: vi.fn(), events: new EventTarget() } as unknown as RpcClient;

describe('ToolGroup', () => {
  it('collapses finished tools by default and expands on header click', () => {
    const { container } = render(
      <ToolGroup
        rpc={rpcMock}
        tools={[{ id: 't1', name: 'terminal', input: { command: 'pytest -k reconnect' }, output: '2 passed' }]}
      />,
    );
    expect(screen.getByRole('button', { name: /Tool actions/i })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.hm-tool-group__body')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Tool actions/i }));
    expect(screen.getByRole('button', { name: /Tool actions/i })).toHaveAttribute('aria-expanded', 'true');
    const body = container.querySelector('.hm-tool-group__body') as HTMLElement;
    expect(body).not.toBeNull();
    expect(within(body).getByText(/Ran · pytest/i)).toBeInTheDocument();
  });

  it('auto-opens while streaming with a running tool', () => {
    render(<ToolGroup rpc={rpcMock} tools={[{ id: 't1', name: 'search_files', input: { path: 'src' } }]} streaming />);
    expect(screen.getByText('Searching files')).toBeInTheDocument();
  });

  it('expands a tool row to show output', () => {
    const { container } = render(
      <ToolGroup rpc={rpcMock} tools={[{ id: 't1', name: 'terminal', input: { command: 'ls' }, output: 'file.txt' }]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tool actions/i }));
    const body = container.querySelector('.hm-tool-group__body') as HTMLElement;
    const rowBtn = within(body).getByRole('button');
    fireEvent.click(rowBtn);
    expect(screen.getAllByText('file.txt').length).toBeGreaterThanOrEqual(1);
  });
});
