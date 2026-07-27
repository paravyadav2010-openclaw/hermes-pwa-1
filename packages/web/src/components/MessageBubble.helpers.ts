import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import type { Approval, Message, RpcClient } from '@hermes-pwa/core';

export interface MessageBubbleProps {
  message: Message;
  rpc: RpcClient;
  isLast?: boolean;
  streaming?: boolean;
  liveStatus?: string;
  liveFace?: string | undefined;
  pendingApprovals?: Approval[] | undefined;
  activeSessionIds?: string[] | undefined;
}

export function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  return (
    prev.message === next.message &&
    prev.rpc === next.rpc &&
    prev.isLast === next.isLast &&
    prev.streaming === next.streaming &&
    prev.liveStatus === next.liveStatus &&
    prev.liveFace === next.liveFace &&
    prev.pendingApprovals === next.pendingApprovals &&
    prev.activeSessionIds === next.activeSessionIds
  );
}

/* ── Image gallery context ─────────────────────────────────────────── */

interface GalleryImage {
  key: string;
  resolvedSrc: string;
  alt: string;
}

interface ImageGalleryCtx {
  register(key: string, resolvedSrc: string, alt: string): void;
  unregister(key: string): void;
  openAt(key: string): void;
}

const ImageGalleryContext = createContext<ImageGalleryCtx | null>(null);

/** Wraps the markdown tree so all MessageImage children share a gallery. */
export function ImageGalleryProvider({ children }: { children: ReactNode }) {
  const imagesRef = useRef<GalleryImage[]>([]);
  const keysRef = useRef(new Set<string>());
  const [lightbox, setLightbox] = useState<{ images: GalleryImage[]; index: number } | null>(null);

  const register = useCallback((key: string, resolvedSrc: string, alt: string) => {
    if (keysRef.current.has(key)) {
      // Update resolved src if it changed
      imagesRef.current = imagesRef.current.map((img) =>
        img.key === key ? { ...img, resolvedSrc, alt } : img,
      );
      return;
    }
    keysRef.current.add(key);
    imagesRef.current = [...imagesRef.current, { key, resolvedSrc, alt }];
  }, []);

  const unregister = useCallback((key: string) => {
    keysRef.current.delete(key);
    imagesRef.current = imagesRef.current.filter((img) => img.key !== key);
  }, []);

  const openAt = useCallback((key: string) => {
    const idx = imagesRef.current.findIndex((img) => img.key === key);
    if (idx >= 0) setLightbox({ images: [...imagesRef.current], index: idx });
  }, []);

  const ctx = useMemo<ImageGalleryCtx>(() => ({ register, unregister, openAt }), [register, unregister, openAt]);

  // Portal to body so fixed positioning is true viewport fullscreen — never
  // trapped by chat/screen transforms (swipe stack, etc.).
  const lightboxNode = lightbox
    ? createElement(Lightbox, {
        images: lightbox.images,
        startIndex: lightbox.index,
        onClose: () => setLightbox(null),
      })
    : null;

  return createElement(
    ImageGalleryContext.Provider,
    { value: ctx },
    children,
    typeof document !== 'undefined' && lightboxNode
      ? createPortal(lightboxNode, document.body)
      : null,
  );
}

/* ── Lightbox with swipe ───────────────────────────────────────────── */

function Lightbox({ images, startIndex, onClose }: { images: GalleryImage[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(images.length - 1, i + 1)), [images.length]);

  // Block tab-swipe gesture while lightbox is open
  useEffect(() => {
    document.body.dataset.lightboxOpen = 'true';
    return () => { delete document.body.dataset.lightboxOpen; };
  }, []);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  // Track drag offset for sliding feel
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<{ x: number; time: number } | null>(null);

  // Swipe handling with sliding animation
  function onTouchStart(e: React.TouchEvent) {
    dragStart.current = { x: e.touches[0].clientX, time: Date.now() };
    setDragOffset(0);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragStart.current) return;
    let dx = e.touches[0].clientX - dragStart.current.x;
    // Rubber-band at edges: dampen drag when past first/last
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === images.length - 1);
    if (atEdge) dx = dx * 0.3;
    setDragOffset(dx);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!dragStart.current) return;
    const dx = e.changedTouches[0].clientX - dragStart.current.x;
    const elapsed = Date.now() - dragStart.current.time;
    const velocity = Math.abs(dx) / elapsed;
    dragStart.current = null;
    setDragOffset(0);
    // Fast flick or significant drag
    if ((Math.abs(dx) > 60 || velocity > 0.3) && Math.abs(dx) > 20) {
      if (dx < 0) next();
      else prev();
    }
  }

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === containerRef.current) onClose();
  }

  if (!images[index]) return null;

  // Render all images as a sliding strip
  return createElement('div', {
    ref: containerRef,
    className: 'hm-md-img-lightbox',
    onClick: onBackdropClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  },
    // Counter
    images.length > 1 && createElement('span', { className: 'hm-md-img-lightbox__counter' },
      `${index + 1} / ${images.length}`,
    ),
    // Prev button
    index > 0 && createElement('button', {
      className: 'hm-md-img-lightbox__nav hm-md-img-lightbox__nav--prev',
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); prev(); },
      'aria-label': 'Previous image',
    },
      createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M15 18l-6-6 6-6' }),
      ),
    ),
    // Sliding strip
    createElement('div', {
      className: 'hm-md-img-lightbox__track',
      style: {
        transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))`,
        transition: dragOffset !== 0 ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
      ...images.map((img, i) =>
        createElement('div', {
          key: img.key,
          className: 'hm-md-img-lightbox__slide',
        },
          createElement('img', {
            src: img.resolvedSrc,
            alt: img.alt,
            className: 'hm-md-img-lightbox__img',
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          }),
        ),
      ),
    ),
    // Next button
    index < images.length - 1 && createElement('button', {
      className: 'hm-md-img-lightbox__nav hm-md-img-lightbox__nav--next',
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); next(); },
      'aria-label': 'Next image',
    },
      createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M9 18l6-6-6-6' }),
      ),
    ),
    // Close button
    createElement('button', {
      className: 'hm-md-img-lightbox__close',
      onClick: onClose,
      'aria-label': 'Close',
    },
      createElement('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M18 6L6 18' }),
        createElement('path', { d: 'M6 6l12 12' }),
      ),
    ),
  );
}

/* ── Clipboard (iOS-safe) ──────────────────────────────────────────── */

export function nodeToPlainText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToPlainText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const el = node as { props?: { children?: ReactNode } };
    return nodeToPlainText(el.props?.children);
  }
  return '';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text.replace(/\u0000/g, '');
  if (!value) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ── Code block ────────────────────────────────────────────────────── */

function CodeBlock({ language, children }: { language?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => nodeToPlainText(children).replace(/\n$/, ''), [children]);
  const lang = (language || 'code').trim() || 'code';

  async function handleCopy(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return createElement(
    'div',
    { className: `hm-code-block${copied ? ' hm-code-block--copied' : ''}` },
    createElement(
      'div',
      { className: 'hm-code-block__header' },
      createElement('span', { className: 'hm-code-block__lang' }, lang),
      createElement(
        'button',
        {
          type: 'button',
          className: `hm-code-block__copy${copied ? ' hm-code-block__copy--done' : ''}`,
          onClick: () => void handleCopy(),
          'aria-label': copied ? 'Copied' : 'Copy code',
          title: copied ? 'Copied' : 'Copy',
        },
        copied ? 'Copied' : 'Copy',
      ),
    ),
    createElement(
      'pre',
      {
        className: 'hm-code-block__pre',
        onDoubleClick: () => void handleCopy(),
      },
      createElement('code', null, children),
    ),
  );
}

/** Inline path / prompt / short code — tap once to copy. */
function InlineCode({ children, ...props }: HTMLAttributes<HTMLElement>) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => nodeToPlainText(children).replace(/\n$/, ''), [children]);
  const isPathLike = useMemo(() => {
    if (text.length < 2) return false;
    if (/^[~./]/.test(text)) return true;
    if (text.includes('/') || text.includes('\\')) return true;
    if (/^[A-Za-z]:\\/.test(text)) return true;
    if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('file:')) return true;
    // Long opaque tokens (hashes, ids) are worth one-tap copy too.
    if (text.length > 24 && !/\s/.test(text)) return true;
    return false;
  }, [text]);

  async function handleCopy(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return createElement(
    'button',
    {
      ...props,
      type: 'button',
      className: [
        'hm-inline-code',
        'hm-copyable',
        isPathLike ? 'hm-copyable--path' : '',
        copied ? 'hm-copyable--done' : '',
      ]
        .filter(Boolean)
        .join(' '),
      onClick: handleCopy,
      title: copied ? 'Copied' : 'Tap to copy',
      'aria-label': copied ? 'Copied' : `Copy ${text}`,
    },
    createElement('span', { className: 'hm-copyable__text' }, children),
    createElement(
      'span',
      { className: 'hm-copyable__badge', 'aria-hidden': true },
      copied ? 'Copied' : 'Copy',
    ),
  );
}

/* ── MessageImage with gallery integration ─────────────────────────── */

export function MessageImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const gallery = useContext(ImageGalleryContext);
  const keyRef = useRef(`img-${src}-${Math.random().toString(36).slice(2, 8)}`);

  // Resolve /api/media and /api/files/read JSON responses to data URLs
  useEffect(() => {
    if (!src) return;
    if (src.startsWith('data:')) return;
    if (src.startsWith('/api/media') || src.startsWith('/api/files/read')) {
      let cancelled = false;
      fetch(src, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const url = data.data_url || data.dataUrl;
          if (url) setResolvedSrc(url);
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }
  }, [src]);

  // Register with gallery when resolved
  useEffect(() => {
    if (!gallery || !resolvedSrc) return;
    gallery.register(keyRef.current, resolvedSrc, alt || '');
    return () => gallery.unregister(keyRef.current);
  }, [gallery, resolvedSrc, alt]);

  const handleClick = useCallback(() => {
    gallery?.openAt(keyRef.current);
  }, [gallery]);

  return createElement('span', { className: 'hm-md-img-wrap' },
    createElement('img', {
      ...props,
      src: resolvedSrc,
      alt: alt || '',
      className: 'hm-md-img',
      loading: 'lazy',
      onClick: handleClick,
      style: { cursor: 'zoom-in' },
    }),
  );
}

/* ── MessageVideo inline player ─────────────────────────────────────── */

export function MessageVideo({ src }: { src?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // For /api/video URLs, use directly (raw bytes served by PWA proxy).
  // For /api/media and /api/files/read, fetch JSON and extract data_url.
  useEffect(() => {
    if (!src) return;
    if (src.startsWith('data:')) { setResolvedSrc(src); setLoading(false); return; }
    if (src.startsWith('/api/video')) {
      // Raw byte endpoint — use directly as video src
      setResolvedSrc(src);
      setLoading(false);
      return;
    }
    if (src.startsWith('/api/media') || src.startsWith('/api/files/read')) {
      let cancelled = false;
      setLoading(true);
      fetch(src, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const url = data.data_url || data.dataUrl;
          if (url) setResolvedSrc(url);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    } else {
      setResolvedSrc(src);
      setLoading(false);
    }
  }, [src]);

  if (loading) {
    return createElement('div', { className: 'hm-video-loading' }, 'Loading video…');
  }

  if (!resolvedSrc) {
    return createElement('div', { className: 'hm-video-error' }, 'Video could not be loaded');
  }

  return createElement('span', { className: 'hm-video-wrap' },
    createElement('video', {
      src: resolvedSrc,
      className: 'hm-video-inline',
      controls: true,
      preload: 'metadata',
      playsInline: true,
    }),
  );
}

/* ── Markdown component overrides ──────────────────────────────────── */

export const MARKDOWN_COMPONENTS = {
  a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement(
      'a',
      { ...props, href, target: '_blank', rel: 'noopener noreferrer' },
      children,
    ),
  code: ({ className, children, ...props }: HTMLAttributes<HTMLElement>) => {
    // Fenced blocks pass language-* className on the inner <code>; pre wraps those.
    if (!className) {
      return createElement(InlineCode, { ...props }, children);
    }
    return createElement('code', { ...props, className }, children);
  },
  pre: ({ children }: HTMLAttributes<HTMLPreElement>) => {
    const codeEl = children as ReactNode & { props?: { className?: string; children?: ReactNode } };
    const lang = codeEl?.props?.className?.replace(/^language-/, '') ?? '';
    const code = codeEl?.props?.children ?? children;
    return createElement(CodeBlock, { language: lang }, code);
  },
  table: ({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) =>
    createElement(
      'div',
      { className: 'hm-md-table-wrap' },
      createElement('table', { ...props, className: 'hm-md-table' }, children),
    ),
  thead: ({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) =>
    createElement('thead', { ...props, className: 'hm-md-table__head' }, children),
  tbody: ({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) =>
    createElement('tbody', { ...props, className: 'hm-md-table__body' }, children),
  tr: ({ children, ...props }: HTMLAttributes<HTMLTableRowElement>) =>
    createElement('tr', { ...props, className: 'hm-md-table__row' }, children),
  th: ({ children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) =>
    createElement('th', { ...props, className: 'hm-md-table__th' }, children),
  td: ({ children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) =>
    createElement('td', { ...props, className: 'hm-md-table__td' }, children),
  img: ({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => {
    if (src && (src.startsWith('/api/video') || /\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#&]|$)/i.test(src))) {
      return createElement(MessageVideo, { src });
    }
    return createElement(MessageImage, { ...props, src, alt });
  },
};
