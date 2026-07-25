import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useCallback, useEffect, useState } from 'react';
import type { Approval, Message, ToolCall } from '@hermes-pwa/core';
import { ToolGroup } from './ToolGroup';
import { TodoPanel } from './TodoPanel';
import { ThinkingDisclosure } from './ThinkingDisclosure';
import { Icon } from './Icon';
import { MARKDOWN_COMPONENTS, areMessageBubblePropsEqual, type MessageBubbleProps } from './MessageBubble.helpers';

const MARKDOWN_REMARK_PLUGINS = [remarkGfm];

const APPROVAL_TOOL_NAMES = new Set(['terminal', 'execute_code']);
const APPROVAL_INLINE_TIME_WINDOW_MS = 5 * 60_000;

function toMillis(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value > 1_000_000_000_000 ? value : value > 1_000_000_000 ? value * 1000 : value;
}

function formatMessageTime(value: number | undefined): string {
  const ms = toMillis(value) ?? Date.now();
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

async function copyText(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function MessageMetaBar({ text, createdAt, show }: { text: string; createdAt: number | undefined; show: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopy = useCallback(() => {
    void copyText(text).then((ok) => {
      if (ok) setCopied(true);
    });
  }, [text]);

  if (!show) return null;

  return (
    <div className="hm-message__meta">
      <time className="hm-message__time" dateTime={createdAt ? new Date(toMillis(createdAt) ?? createdAt).toISOString() : undefined}>
        {formatMessageTime(createdAt)}
      </time>
      <button
        type="button"
        className={`hm-message__copy${copied ? ' hm-message__copy--done' : ''}`}
        onClick={onCopy}
        disabled={!text.trim()}
        aria-label={copied ? 'Copied' : 'Copy response'}
        title={copied ? 'Copied' : 'Copy'}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
    </div>
  );
}

function firstApprovalLine(summary: string | undefined): string {
  return (summary ?? '').split(/\r?\n/u).find((line) => line.trim())?.trim() ?? '';
}

function approvalBelongsToActiveChat(approval: Approval, activeSessionIds: Set<string>): boolean {
  if (activeSessionIds.size === 0) return false;
  if (approval.sourceSessionId) return activeSessionIds.has(approval.sourceSessionId);
  return Boolean(approval.sessionId && activeSessionIds.has(approval.sessionId));
}

function approvalNearMessage(approval: Approval, message: Message): boolean {
  const approvalTime = toMillis(approval.createdAt);
  const messageTime = toMillis(message.createdAt);
  return Boolean(
    approvalTime !== undefined &&
    messageTime !== undefined &&
    Math.abs(approvalTime - messageTime) <= APPROVAL_INLINE_TIME_WINDOW_MS,
  );
}

function recoveredApprovalTool(
  message: Message,
  isLast: boolean | undefined,
  pendingApprovals: Approval[] | undefined,
  activeSessionIds: string[] | undefined,
): ToolCall | undefined {
  if (message.role !== 'assistant' || isLast === false) return undefined;
  const pendingApprovalTools = message.toolCalls?.filter(
    (tool) => tool.output === undefined && APPROVAL_TOOL_NAMES.has(tool.name),
  ) ?? [];
  if (pendingApprovalTools.length > 0) return undefined;

  const approvals = pendingApprovals ?? [];
  if (approvals.length === 0) return undefined;
  const activeSessionIdSet = new Set(activeSessionIds ?? []);

  const scoped = approvals.find((approval) => approvalBelongsToActiveChat(approval, activeSessionIdSet));
  const timeScoped = approvals.find((approval) => approvalNearMessage(approval, message));
  const singleApproval = approvals.length === 1 ? approvals[0] : undefined;
  const fallback = singleApproval && !singleApproval.sourceSessionId ? singleApproval : undefined;
  const approval = scoped ?? timeScoped ?? fallback;
  const command = firstApprovalLine(approval?.summary);
  if (!approval || !command) return undefined;
  return {
    id: `recovered-${approval.id}`,
    name: 'terminal',
    input: { command },
  };
}

function MessageBubbleView({ message, rpc, isLast, streaming, liveStatus, liveFace, pendingApprovals, activeSessionIds }: MessageBubbleProps) {
  if (message.role === 'tool') {
    return null;
  }

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="hm-message hm-message--user">
        <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{message.text}</ReactMarkdown>
        <MessageMetaBar text={message.text} createdAt={message.createdAt} show={Boolean(message.text.trim())} />
      </div>
    );
  }

  const active = Boolean(streaming && isLast !== false);
  const showCaret = active && message.role === 'assistant';
  const completedTodoTool = message.toolCalls?.filter((t) => t.name === 'todo' && typeof t.output === 'string').at(-1);
  const recoveredTool = recoveredApprovalTool(message, isLast, pendingApprovals, activeSessionIds);
  const otherTools = [
    ...(message.toolCalls?.filter((t) => t.name !== 'todo') ?? []),
    ...(recoveredTool ? [recoveredTool] : []),
  ];
  const hasActions = Boolean(message.thinking?.trim()) || Boolean(completedTodoTool) || otherTools.length > 0;
  const showHeaderStatus = active && Boolean(liveStatus?.trim());
  const statusFace = liveFace?.trim();

  return (
    <div className="hm-message hm-message--assistant">
      <div className="hm-message__header">
        <span className="hm-message__avatar">
          <img src="./icons/icon-192.png" alt="" aria-hidden="true" />
        </span>
        {showHeaderStatus ? (
          <span className="hm-live-status hm-live-status--inline" role="status" aria-live="polite">
            {statusFace ? <span className="hm-live-status__face" aria-hidden="true">{statusFace}</span> : null}
            <span className="hm-live-status__text">{liveStatus}</span>
            <span className="hm-live-status__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        ) : (
          <span className="hm-message__activity" aria-label={active ? 'Assistant is active' : 'Assistant response complete'}>
            {active ? (
              <span className="hm-message__activity-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : (
              <span className="hm-message__activity-dot" aria-hidden="true" />
            )}
          </span>
        )}
      </div>

      {hasActions && (
        <div className="hm-message__actions">
          {(message.thinkingParts && message.thinkingParts.length > 0
            ? message.thinkingParts
            : message.thinking?.trim()
              ? [message.thinking]
              : []
          ).map((part, idx, arr) => (
            <ThinkingDisclosure
              key={`think-${message.id}-${idx}`}
              text={part}
              streaming={active && idx === arr.length - 1}
              label={arr.length > 1 ? `Thinking ${idx + 1}` : 'Thinking'}
            />
          ))}

          {completedTodoTool && (
            <div className="hm-message__todos">
              <TodoPanel tool={completedTodoTool} />
            </div>
          )}

          {otherTools.length > 0 && <ToolGroup tools={otherTools} rpc={rpc} streaming={active} />}
        </div>
      )}

      {message.text ? (
        <div className="hm-message__text">
          <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{message.text}</ReactMarkdown>
          {showCaret && <span className="hm-message__caret" />}
        </div>
      ) : null}

      <MessageMetaBar
        text={message.text}
        createdAt={message.createdAt}
        show={!active && Boolean(message.text.trim())}
      />
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleView, areMessageBubblePropsEqual);
MessageBubble.displayName = 'MessageBubble';
