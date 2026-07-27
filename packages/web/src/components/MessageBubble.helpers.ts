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

const LIGHTBOX_ROOT_ID = 'hm-lightbox-root';

/** Dedicated portal host outside swipe-stack / app-shell transforms. */
export function getLightboxRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(LIGHTBOX_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = LIGHTBOX_ROOT_ID;
    el.setAttribute('data-hm-lightbox-root', 'true');
    el.style.cssText = [
      'position:fixed',
      'inset:0',
      'width:100%',
      'height:100%',
      'margin:0',
      'padding:0',
      'border:0',
      'z-index:2147483000',
      'pointer-events:none',
      'transform:none',
      'isolation:isolate',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

/** Wraps the markdown tree so all MessageImage children share a gallery. */
export function ImageGalleryProvider({ children }: { children: ReactNode }) {
  const imagesRef = useRef<GalleryImage[]>([]);
  const keysRef = useRef(new Set<string>());
  const [lightbox, setLightbox] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(getLightboxRoot());
  }, []);

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

  // Portal outside chat/screen transforms so position:fixed is true viewport.
  const host = portalRoot ?? (typeof document !== 'undefined' ? getLightboxRoot() : null);
  const lightboxNode = lightbox && host
    ? createPortal(
        createElement(Lightbox, {
          images: lightbox.images,
          startIndex: lightbox.index,
          onClose: () => setLightbox(null),
        }),
        host,
      )
    : null;

  return createElement(
    ImageGalleryContext.Provider,
    { value: ctx },
    children,
    lightboxNode,
  );
}

/* ── Lightbox with swipe ───────────────────────────────────────────── */

const LIGHTBOX_INLINE_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100vw',
  height: '100vh',
  // dvw/dvh beat iOS chrome / PWA safe layout (also set via class CSS)
  maxWidth: '100vw',
  maxHeight: '100vh',
  margin: 0,
  padding: 0,
  border: 0,
  zIndex: 2147483000,
  background: 'rgba(0, 0, 0, 0.96)',
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'stretch',
  transform: 'none',
  isolation: 'isolate',
  overscrollBehavior: 'none',
  touchAction: 'none',
  pointerEvents: 'auto',
  cursor: 'zoom-out',
  boxSizing: 'border-box',
};

function Lightbox({ images, startIndex, onClose }: { images: GalleryImage[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportBox, setViewportBox] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [slideWidth, setSlideWidth] = useState(0);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(images.length - 1, i + 1)), [images.length]);

  // Body scroll lock + block tab-swipe while open
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    body.dataset.lightboxOpen = 'true';
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    return () => {
      delete body.dataset.lightboxOpen;
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);

  // visualViewport pixel box (iOS address bar / keyboard safe)
  useEffect(() => {
    const apply = () => {
      const vv = window.visualViewport;
      if (vv) {
        setViewportBox({
          top: Math.round(vv.offsetTop),
          left: Math.round(vv.offsetLeft),
          width: Math.round(vv.width),
          height: Math.round(vv.height),
        });
      } else {
        setViewportBox({
          top: 0,
          left: 0,
          width: Math.round(window.innerWidth),
          height: Math.round(window.innerHeight),
        });
      }
      const el = containerRef.current;
      if (el) setSlideWidth(el.clientWidth || window.innerWidth);
    };
    apply();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
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

  // Horizontal = gallery; vertical up/down = dismiss (iOS Photos-style)
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const axisLock = useRef<'x' | 'y' | null>(null);
  const dismissingRef = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    if (dismissingRef.current) return;
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    axisLock.current = null;
    setDragX(0);
    setDragY(0);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragStart.current || dismissingRef.current) return;
    const dx = e.touches[0].clientX - dragStart.current.x;
    const dy = e.touches[0].clientY - dragStart.current.y;

    // Lock axis after a small movement so gallery vs dismiss don't fight
    if (!axisLock.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisLock.current = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }

    if (axisLock.current === 'y') {
      setDragY(dy);
      setDragX(0);
      return;
    }

    let adjX = dx;
    const atEdge = (adjX > 0 && index === 0) || (adjX < 0 && index === images.length - 1);
    if (atEdge) adjX = adjX * 0.3;
    setDragX(adjX);
    setDragY(0);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!dragStart.current || dismissingRef.current) return;
    const dx = e.changedTouches[0].clientX - dragStart.current.x;
    const dy = e.changedTouches[0].clientY - dragStart.current.y;
    const elapsed = Math.max(1, Date.now() - dragStart.current.time);
    const axis = axisLock.current;
    dragStart.current = null;
    axisLock.current = null;

    if (axis === 'y') {
      const velocityY = Math.abs(dy) / elapsed;
      // Swipe up or down closes
      if (Math.abs(dy) > 80 || (velocityY > 0.45 && Math.abs(dy) > 28)) {
        dismissingRef.current = true;
        setDragY(dy < 0 ? -Math.max(viewportBox.height || window.innerHeight, 400) : Math.max(viewportBox.height || window.innerHeight, 400));
        window.setTimeout(() => onClose(), 160);
        return;
      }
      setDragY(0);
      setDragX(0);
      return;
    }

    setDragX(0);
    setDragY(0);
    const velocityX = Math.abs(dx) / elapsed;
    if ((Math.abs(dx) > 60 || velocityX > 0.3) && Math.abs(dx) > 20) {
      if (dx < 0) next();
      else prev();
    }
  }

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === containerRef.current) onClose();
  }

  if (!images[index]) return null;

  const widthPx = slideWidth || viewportBox.width || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const heightPx = viewportBox.height || (typeof window !== 'undefined' ? window.innerHeight : 0);
  const dismissProgress = heightPx > 0 ? Math.min(1, Math.abs(dragY) / (heightPx * 0.35)) : 0;
  const bgAlpha = Math.max(0.35, 0.96 * (1 - dismissProgress * 0.75));
  const dragging = dragX !== 0 || dragY !== 0;

  const boxStyle: React.CSSProperties = {
    ...LIGHTBOX_INLINE_STYLE,
    background: `rgba(0, 0, 0, ${bgAlpha})`,
    transition: dragging || dismissingRef.current ? 'none' : 'background 0.2s ease',
    ...(viewportBox.width > 0
      ? {
          top: viewportBox.top,
          left: viewportBox.left,
          width: viewportBox.width,
          height: viewportBox.height,
          right: 'auto',
          bottom: 'auto',
          maxWidth: viewportBox.width,
          maxHeight: viewportBox.height,
        }
      : null),
  };

  const chromeOpacity = Math.max(0, 1 - dismissProgress * 1.4);

  // Render all images as a sliding strip
  return createElement('div', {
    ref: containerRef,
    className: 'hm-md-img-lightbox',
    role: 'dialog',
    'aria-modal': true,
    'aria-label': 'Image viewer',
    style: boxStyle,
    onClick: onBackdropClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  },
    // Counter
    images.length > 1 && createElement('span', {
      className: 'hm-md-img-lightbox__counter',
      style: { opacity: chromeOpacity },
    },
      `${index + 1} / ${images.length}`,
    ),
    // Prev button
    index > 0 && createElement('button', {
      type: 'button',
      className: 'hm-md-img-lightbox__nav hm-md-img-lightbox__nav--prev',
      style: { opacity: chromeOpacity },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); prev(); },
      'aria-label': 'Previous image',
    },
      createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M15 18l-6-6 6-6' }),
      ),
    ),
    // Sliding strip — pixel translate; vertical drag dismisses
    createElement('div', {
      className: 'hm-md-img-lightbox__track',
      style: {
        transform: `translate3d(${(-index * widthPx) + dragX}px, ${dragY}px, 0) scale(${1 - dismissProgress * 0.08})`,
        transition: dragging || dismissingRef.current ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
        width: widthPx > 0 ? `${images.length * widthPx}px` : undefined,
        opacity: Math.max(0.25, 1 - dismissProgress * 0.35),
      },
    },
      ...images.map((img) =>
        createElement('div', {
          key: img.key,
          className: 'hm-md-img-lightbox__slide',
          style: widthPx > 0 ? { flex: `0 0 ${widthPx}px`, width: widthPx } : undefined,
        },
          createElement('img', {
            src: img.resolvedSrc,
            alt: img.alt,
            className: 'hm-md-img-lightbox__img',
            draggable: false,
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          }),
        ),
      ),
    ),
    // Next button
    index < images.length - 1 && createElement('button', {
      type: 'button',
      className: 'hm-md-img-lightbox__nav hm-md-img-lightbox__nav--next',
      style: { opacity: chromeOpacity },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); next(); },
      'aria-label': 'Next image',
    },
      createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M9 18l6-6-6-6' }),
      ),
    ),
    // Close button
    createElement('button', {
      type: 'button',
      className: 'hm-md-img-lightbox__close',
      style: { opacity: chromeOpacity },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); onClose(); },
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
