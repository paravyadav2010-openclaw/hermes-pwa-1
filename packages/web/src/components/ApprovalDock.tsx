import { useState } from 'react';
import type { Approval, RpcClient } from '@hermes-pwa/core';
import { useActivityStore } from '@hermes-pwa/core';
import { Icon } from './Icon';

type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

function riskStyle(highImpact: boolean | undefined) {
  if (highImpact) {
    return { bg: 'var(--hm-color-danger-bg)', color: 'var(--hm-color-danger-strong)', label: 'high risk' };
  }
  return { bg: 'var(--hm-color-warning-bg)', color: 'var(--hm-color-warning-strong)', label: 'needs you' };
}

function ApprovalDockCard({
  rpc,
  approval,
}: {
  rpc: RpcClient;
  approval: Approval;
}) {
  const respondApproval = useActivityStore((s) => s.respondApproval);
  const [submitting, setSubmitting] = useState<ApprovalChoice | null>(null);
  const busy = submitting !== null;
  const style = riskStyle(approval.highImpact);

  async function respond(choice: ApprovalChoice) {
    if (busy) return;
    if (choice === 'always') {
      const ok = window.confirm(
        'Always allow this approval pattern? This is persistent and can affect future Hermes actions.',
      );
      if (!ok) return;
    }
    setSubmitting(choice);
    try {
      await respondApproval(
        rpc,
        approval.id,
        choice === 'deny' ? 'reject' : 'approve',
        approval.sessionId,
        choice,
      );
    } catch {
      setSubmitting(null);
    }
  }

  return (
    <div className="hm-approval-dock__card" data-slot="approval-dock-card">
      <div className="hm-approval-dock__header">
        <span className="hm-approval-dock__icon" aria-hidden="true">
          <Icon name="shield" size={16} />
        </span>
        <span className="hm-approval-dock__title">{approval.title || 'Approval required'}</span>
        <span className="hm-approval-dock__risk" style={{ background: style.bg, color: style.color }}>
          {style.label}
        </span>
      </div>
      {approval.summary ? <div className="hm-approval-dock__cmd">{approval.summary}</div> : null}
      <div className="hm-approval-dock__actions">
        <button type="button" className="hm-approval-dock__approve" disabled={busy} onClick={() => void respond('once')}>
          {submitting === 'once' ? 'Running…' : 'Run'}
        </button>
        <button type="button" className="hm-approval-dock__deny" disabled={busy} onClick={() => void respond('deny')}>
          {submitting === 'deny' ? 'Rejecting…' : 'Reject'}
        </button>
        <button type="button" className="hm-approval-dock__session" disabled={busy} onClick={() => void respond('session')}>
          {submitting === 'session' ? 'Allowing…' : 'Session'}
        </button>
        <button type="button" className="hm-approval-dock__always" disabled={busy} onClick={() => void respond('always')}>
          {submitting === 'always' ? 'Allowing…' : 'Always'}
        </button>
      </div>
    </div>
  );
}

/** Sticky dock above the composer for anything needing approval. */
export function ApprovalDock({
  rpc,
  approvals,
}: {
  rpc: RpcClient;
  approvals: Approval[];
}) {
  if (approvals.length === 0) return null;

  return (
    <div className="hm-chat__approval-dock" role="region" aria-label="Pending approvals">
      {approvals.map((approval) => (
        <ApprovalDockCard key={approval.id} rpc={rpc} approval={approval} />
      ))}
    </div>
  );
}
