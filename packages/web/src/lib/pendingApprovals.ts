import type { ActionItem, Approval, Clarify } from '@hermes-pwa/core';

export function selectPendingApprovals(items: ActionItem[]): Approval[] {
  return items.filter((item): item is Approval => item.kind === 'approval' && item.status === 'needs_you');
}

export function selectPendingClarifies(items: ActionItem[]): Clarify[] {
  return items.filter((item): item is Clarify => item.kind === 'clarify' && item.status === 'needs_you');
}

export function pendingApprovalsForMessage(
  pendingApprovals: Approval[],
  index: number,
  messageCount: number,
): Approval[] | undefined {
  return index === messageCount - 1 ? pendingApprovals : undefined;
}
