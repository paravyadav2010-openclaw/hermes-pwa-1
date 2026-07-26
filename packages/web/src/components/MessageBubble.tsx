import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Approval, Message, ToolCall } from '@hermes-pwa/core';
import { ToolGroup } from './ToolGroup';
import { TodoPanel } from './TodoPanel';
import { ThinkingDisclosure } from './ThinkingDisclosure';
import { Icon } from './Icon';
import { MARKDOWN_COMPONENTS, ImageGalleryProvider, MessageImage, MessageVideo, areMessageBubblePropsEqual, type MessageBubbleProps } from './MessageBubble.helpers';

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

  if (isUser) {
    const preprocessed = preprocessMediaRefs(message.text);
    const { images: imageUrls, videos: videoUrls } = useMemo(() => extractMediaUrls(preprocessed), [preprocessed]);
    const textOnly = useMemo(() => stripImages(preprocessed), [preprocessed]);
    return (
      <div className="hm-message hm-message--user">
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

      {message.text ? (() => {
        const preprocessed = preprocessMediaRefs(message.text);
        const { images: imageUrls, videos: videoUrls } = extractMediaUrls(preprocessed);
        const textOnly = stripImages(preprocessed);
        return (
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
        );
      })() : null}

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
