import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clarify, RpcClient } from '@hermes-pwa/core';
import { useActivityStore } from '@hermes-pwa/core';
import { ClarifyDock } from './ClarifyDock';

const rpcMock = { request: vi.fn(), onFrame: vi.fn(), events: new EventTarget() } as unknown as RpcClient;
const clarify: Clarify = {
  id: 'request-42',
  kind: 'clarify',
  status: 'needs_you',
  title: 'Choose a deployment target',
  question: 'Where should this deploy?',
  choices: ['Staging', 'Production'],
  createdAt: 1,
};

describe('ClarifyDock', () => {
  beforeEach(() => {
    vi.mocked(rpcMock.request).mockReset().mockResolvedValue({});
    useActivityStore.setState({ items: [clarify], loading: false, error: undefined });
  });

  it('renders gateway choices above the composer and sends a tapped choice', async () => {
    render(<ClarifyDock rpc={rpcMock} clarifies={[clarify]} />);

    expect(screen.getByText('Where should this deploy?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));

    await waitFor(() => {
      expect(rpcMock.request).toHaveBeenCalledWith('clarify.respond', {
        request_id: 'request-42',
        answer: 'Production',
      });
    });
  });

  it('offers a typed Other response without sending a normal chat message', async () => {
    render(<ClarifyDock rpc={rpcMock} clarifies={[clarify]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Other…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom response' }), { target: { value: 'Canary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(rpcMock.request).toHaveBeenCalledWith('clarify.respond', {
        request_id: 'request-42',
        answer: 'Canary',
      });
    });
  });
});
