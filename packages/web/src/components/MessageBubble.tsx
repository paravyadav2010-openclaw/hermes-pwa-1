import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Approval, Message, RpcClient, ToolCall } from '@hermes-pwa/core';
import { ToolGroup } from './ToolGroup';
import { TodoPanel } from './TodoPanel';
import { ThinkingGroup, LiveThinking } from './ThinkingGroup';
import { Icon } from './Icon';
import {
  MARKDOWN_COMPONENTS,
  ImageGalleryProvider,
  MessageImage,
  MessageVideo,
  areMessageBubblePropsEqual,
  type MessageBubbleProps,
} from './MessageBubble.helpers';
import { collectThinkingParts, joinAssistantText } from '../lib/transcriptGrouping';


/** Inline image for the grid (outside ReactMarkdown). */
function MessageImageInline({ src, alt }: { src: string; alt?: string }) {
  return <MessageImage src={src} alt={alt ?? ''} />;
}

const MARKDOWN_REMARK_PLUGINS = [remarkGfm];

/**
 * Convert image/video references in message text to markdown syntax
 * so ReactMarkdown renders them via the gateway's /api/media endpoint.
 * Video files proxied through /api/video for raw byte streaming.
 */
function preprocessMediaRefs(text: string): string {
  // 1. MEDIA:/absolute/path/to/file → markdown via /api/media (images) or /api/video (videos)
  let result = text.replace(
    /MEDIA:(\/[^\s\n]+)/g,
    (_match, filePath) => {
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const isVideo = ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'].includes(ext);
      return isVideo
        ? `![](/api/video?path=${encodeURIComponent(filePath)})`
        : `![](/api/media?path=${encodeURIComponent(filePath)})`;
    },
  );
  // 2. @file: references (user uploads from Composer)
  result = result.replace(
    /@file:([^\s\n)]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif|mp4|webm|mov|m4v|avi|mkv)(?:\?[^\s\n)]*)?)/gi,
    (_match, filePath) => {
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const isVideo = ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'].includes(ext);
      return isVideo
        ? `![](/api/video?path=${encodeURIComponent(filePath)})`
        : `![](/api/files/read?path=${encodeURIComponent(filePath)})`;
    },
  );
  return result;
}

/** True if the URL points to a video file (checks the full URL including query params). */
function isVideoUrl(url: string): boolean {
  // Check for /api/video prefix (PWA proxy serving raw video bytes)
  if (url.startsWith('/api/video')) return true;
  // Or a known video extension in the URL
  return /\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#&]|$)/i.test(url);
}

/** Extract image/video URLs from preprocessed markdown text, split by type. */
function extractMediaUrls(text: string): { images: string[]; videos: string[] } {
  const allUrls: string[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) allUrls.push(m[2]);
  const images: string[] = [];
  const videos: string[] = [];
  for (const url of allUrls) {
    if (isVideoUrl(url)) videos.push(url);
    else images.push(url);
  }
  return { images, videos };
}

/** Remove markdown image syntax from text (for separate grid rendering). */
function stripImages(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]+\)\s*/g, '').trim();
}

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
  const isSteer = isUser && message.id.startsWith('steer-');

  if (isUser) {
    const preprocessed = preprocessMediaRefs(message.text);
    const { images: imageUrls, videos: videoUrls } = extractMediaUrls(preprocessed);
    const textOnly = stripImages(preprocessed);
    return (
      <div className={`hm-message hm-message--user${isSteer ? ' hm-message--steer' : ''} hm-message--reveal`}>
        {isSteer && <span className="hm-message__steer-label">Steer message</span>}
        {textOnly && <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{textOnly}</ReactMarkdown>}
        {videoUrls.length > 0 && (
          <div className="hm-video-grid">
            {videoUrls.map((url, i) => (
              <span key={i} className="hm-video-wrap">
                <MessageVideo src={url} />
              </span>
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <ImageGalleryProvider>
            <div className={`hm-image-grid${imageUrls.length === 1 ? ' hm-image-grid--single' : ''}`}>
              {imageUrls.map((url, i) => (
                <span key={i} className="hm-md-img-wrap">
                  <MessageImageInline src={url} alt="" />
                </span>
              ))}
            </div>
          </ImageGalleryProvider>
        )}
        <MessageMetaBar text={message.text} createdAt={message.createdAt} show={Boolean(message.text.trim())} />
      </div>
    );
  }

  // Single-message path used by unit tests; Chat uses AssistantTurn for grouped turns.
  return (
    <AssistantTurn
      messages={[message]}
      rpc={rpc}
      isLast={isLast}
      streaming={streaming}
      liveStatus={liveStatus}
      liveFace={liveFace}
      pendingApprovals={pendingApprovals}
      activeSessionIds={activeSessionIds}
    />
  );
}

export interface AssistantTurnProps {
  messages: Message[];
  rpc: RpcClient;
  isLast?: boolean | undefined;
  streaming?: boolean | undefined;
  liveStatus?: string | undefined;
  liveFace?: string | undefined;
  pendingApprovals?: Approval[] | undefined;
  activeSessionIds?: string[] | undefined;
}

/**
 * One assistant turn: chronological thinking + tools, then ALL reply prose under them.
 * Never interleave output text between tool/thinking blocks.
 */
export function AssistantTurn({
  messages,
  rpc,
  isLast,
  streaming,
  liveStatus,
  liveFace,
  pendingApprovals,
  activeSessionIds,
}: AssistantTurnProps) {
  const active = Boolean(streaming && isLast !== false);
  const lastMessage = messages[messages.length - 1];
  const thinkingParts = useMemo(() => collectThinkingParts(messages), [messages]);
  const combinedText = useMemo(() => joinAssistantText(messages), [messages]);
  const showCaret = active && Boolean(lastMessage);

  const otherTools = useMemo(() => {
    const tools: ToolCall[] = [];
    const seen = new Set<string>();
    for (const message of messages) {
      for (const tool of message.toolCalls ?? []) {
        if (tool.name === 'todo') continue;
        const key = tool.id || `${tool.name}:${JSON.stringify(tool.input ?? {})}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tools.push(tool);
      }
    }
    const recovered = lastMessage
      ? recoveredApprovalTool(lastMessage, isLast, pendingApprovals, activeSessionIds)
      : undefined;
    if (recovered && !seen.has(recovered.id)) tools.push(recovered);
    return tools;
  }, [messages, lastMessage, isLast, pendingApprovals, activeSessionIds]);

  const completedTodoTool = useMemo(() => {
    if (active || isLast === false) return undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const todo = messages[i]?.toolCalls?.filter((tool) => tool.name === 'todo' && typeof tool.output === 'string').at(-1);
      if (todo) return todo;
    }
    return undefined;
  }, [messages, active, isLast]);

  const preprocessed = preprocessMediaRefs(combinedText);
  const { images: imageUrls, videos: videoUrls } = extractMediaUrls(preprocessed);
  const textOnly = stripImages(preprocessed);
  const hasText = Boolean(textOnly || imageUrls.length > 0 || videoUrls.length > 0);

  const hasRunningTools = active && otherTools.some((tool) => tool.output === undefined);
  // Live thinking stays OUTSIDE the collapsible group. Once tools/text start
  // (or the turn ends), every thought folds into ThinkingGroup like tools.
  const thinkingIsLive = active && !hasRunningTools && !hasText && thinkingParts.length > 0;
  const liveThinking = thinkingIsLive ? thinkingParts[thinkingParts.length - 1] : undefined;
  const groupedThinking = thinkingIsLive ? thinkingParts.slice(0, -1) : thinkingParts;

  const hasActions =
    groupedThinking.length > 0 ||
    Boolean(liveThinking?.trim()) ||
    Boolean(completedTodoTool) ||
    otherTools.length > 0;
  const showLiveStatus = active && Boolean(liveStatus?.trim());
  const statusFace = liveFace?.trim();

  return (
    <div className="hm-message hm-message--assistant hm-message--reveal hm-assistant-turn">
      {showLiveStatus && (
        <span className="hm-message__status" role="status" aria-live="polite">
          {statusFace ? <span className="hm-message__status-face" aria-hidden="true">{statusFace}</span> : null}
          <span>{liveStatus}</span>
          <span className="hm-message__activity-dots" aria-label="Assistant is active" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      )}

      {!showLiveStatus && active && !hasText && !hasActions && (
        <span className="hm-message__activity-dots hm-message__activity-dots--standalone" aria-label="Assistant is active">
          <span />
          <span />
          <span />
        </span>
      )}

      {/* Activity trail: settled thinking group → live thinking → tools. Prose below. */}
      {hasActions && (
        <div className="hm-message__actions">
          {groupedThinking.length > 0 && (
            <ThinkingGroup parts={groupedThinking} streaming={active} />
          )}

          {liveThinking ? <LiveThinking text={liveThinking} /> : null}

          {completedTodoTool && (
            <div className="hm-message__todos"><TodoPanel tool={completedTodoTool} /></div>
          )}

          {otherTools.length > 0 && <ToolGroup tools={otherTools} rpc={rpc} streaming={active} />}
        </div>
      )}

      {/* ALL reply prose under the activity trail — never between tools/thinking. */}
      {hasText ? (
        <div className="hm-message__text">
          {textOnly && <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{textOnly}</ReactMarkdown>}
          {videoUrls.length > 0 && (
            <div className="hm-video-grid">
              {videoUrls.map((url, i) => (
                <span key={i} className="hm-video-wrap">
                  <MessageVideo src={url} />
                </span>
              ))}
            </div>
          )}
          {imageUrls.length > 0 && (
            <ImageGalleryProvider>
              <div className={`hm-image-grid${imageUrls.length === 1 ? ' hm-image-grid--single' : ''}`}>
                {imageUrls.map((url, i) => (
                  <span key={i} className="hm-md-img-wrap">
                    <MessageImageInline src={url} alt="" />
                  </span>
                ))}
              </div>
            </ImageGalleryProvider>
          )}
          {showCaret && <span className="hm-message__caret" />}
        </div>
      ) : showCaret ? (
        <div className="hm-message__text">
          <span className="hm-message__caret" />
        </div>
      ) : null}

      <MessageMetaBar
        text={combinedText}
        createdAt={lastMessage?.createdAt}
        show={!active && Boolean(combinedText.trim())}
      />
    </div>
  );
}
export const MessageBubble = memo(MessageBubbleView, areMessageBubblePropsEqual);
MessageBubble.displayName = 'MessageBubble';
