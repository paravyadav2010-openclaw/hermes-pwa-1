import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApprovalDock } from './ApprovalDock';
import { useActivityStore, type Approval, type RpcClient } from '@hermes-pwa/core';

const rpcMock = { request: vi.fn(), onFrame: vi.fn(), events: new EventTarget() } as unknown as RpcClient;

function makeApproval(partial: Partial<Approval> = {}): Approval {
  return {
    id: 'appr-1',
    kind: 'approval',
    status: 'needs_you',
    title: 'terminal',
    summary: 'rm -rf /tmp/example',
    sessionId: 'sess-1',
    createdAt: Date.now(),
    highImpact: true,
    ...partial,
  } as Approval;
}

describe('ApprovalDock', () => {
  it('renders nothing when there are no approvals', () => {
    const { container } = render(<ApprovalDock rpc={rpcMock} approvals={[]} />);
    expect(container.querySelector('.hm-chat__approval-dock')).toBeNull();
  });

  it('docks pending approvals above the composer surface', () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined);
    useActivityStore.setState({ respondApproval } as never);

    render(<ApprovalDock rpc={rpcMock} approvals={[makeApproval()]} />);

    expect(screen.getByRole('region', { name: /pending approvals/i })).toBeInTheDocument();
    expect(screen.getByText('terminal')).toBeInTheDocument();
    expect(screen.getByText('rm -rf /tmp/example')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('calls respondApproval when Run is tapped', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined);
    useActivityStore.setState({ respondApproval } as never);
    const approval = makeApproval({ id: 'appr-run' });

    render(<ApprovalDock rpc={rpcMock} approvals={[approval]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(respondApproval).toHaveBeenCalledWith(rpcMock, 'appr-run', 'approve', 'sess-1', 'once');
  });
});
