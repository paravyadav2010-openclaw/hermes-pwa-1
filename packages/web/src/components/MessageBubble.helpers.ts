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
  onPinMessage?: ((message: Message) => void) | undefined;
  pinnedMessageIds?: string[] | undefined;
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
    prev.activeSessionIds === next.activeSessionIds &&
    prev.onPinMessage === next.onPinMessage &&
    prev.pinnedMessageIds === next.pinnedMessageIds
  );
}

/* ── Image gallery context ─────────────────────────────────────────── */

interface GalleryImage {
  key: string;
  resolvedSrc: string;
  alt: string;
}

export interface ThumbRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ImageGalleryCtx {
  register(key: string, resolvedSrc: string, alt: string): void;
  unregister(key: string): void;
  openAt(key: string, origin?: ThumbRect | null): void;
}

const ImageGalleryContext = createContext<ImageGalleryCtx | null>(null);

const LIGHTBOX_ROOT_ID = 'hm-lightbox-root';
const GALLERY_KEY_ATTR = 'data-hm-gallery-key';
const OPEN_MS = 340;
const CLOSE_MS = 320;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

function measureThumbRect(key: string): ThumbRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[${GALLERY_KEY_ATTR}="${CSS.escape(key)}"]`) as HTMLElement | null;
  if (!el) return null;
  const b = el.getBoundingClientRect();
  if (b.width < 2 || b.height < 2) return null;
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}

function readBorderRadius(key: string): string {
  if (typeof document === 'undefined') return '12px';
  const el = document.querySelector(`[${GALLERY_KEY_ATTR}="${CSS.escape(key)}"]`) as HTMLElement | null;
  if (!el) return '12px';
  const cs = window.getComputedStyle(el);
  return cs.borderRadius || '12px';
}

function setThumbHidden(key: string | null, hidden: boolean) {
  if (typeof document === 'undefined' || !key) return;
  const el = document.querySelector(`[${GALLERY_KEY_ATTR}="${CSS.escape(key)}"]`) as HTMLElement | null;
  if (!el) return;
  if (hidden) {
    el.dataset.hmLightboxSource = '1';
    el.style.opacity = '0';
    el.style.transition = 'opacity 80ms linear';
  } else {
    delete el.dataset.hmLightboxSource;
    el.style.opacity = '';
    el.style.transition = '';
  }
}

function viewportBoxNow(): { left: number; top: number; width: number; height: number } {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) {
    return {
      left: Math.round(vv.offsetLeft),
      top: Math.round(vv.offsetTop),
      width: Math.round(vv.width),
      height: Math.round(vv.height),
    };
  }
  return {
    left: 0,
    top: 0,
    width: typeof window !== 'undefined' ? Math.round(window.innerWidth) : 390,
    height: typeof window !== 'undefined' ? Math.round(window.innerHeight) : 844,
  };
}

/** Read iOS safe-area insets (px) via a throwaway node. */
function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';');
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  el.remove();
  return out;
}

/**
 * Content box of a gallery slide — must match `.hm-md-img-lightbox__slide` padding:
 * top max(52, safe+44), right/left max(12, safe), bottom max(24, safe+16)
 */
function gallerySlideContentRect(vp = viewportBoxNow()): ThumbRect {
  const s = safeAreaInsets();
  const padT = Math.max(52, s.top + 44);
  const padR = Math.max(12, s.right);
  const padB = Math.max(24, s.bottom + 16);
  const padL = Math.max(12, s.left);
  return {
    left: Math.round(vp.left + padL),
    top: Math.round(vp.top + padT),
    width: Math.max(1, Math.round(vp.width - padL - padR)),
    height: Math.max(1, Math.round(vp.height - padT - padB)),
  };
}

/** object-fit:contain destination inside the gallery slide content box. */
function galleryImageRect(naturalW?: number, naturalH?: number, vp = viewportBoxNow()): ThumbRect {
  const box = gallerySlideContentRect(vp);
  if (!naturalW || !naturalH || naturalW < 1 || naturalH < 1) return box;
  const scale = Math.min(box.width / naturalW, box.height / naturalH);
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));
  return {
    left: Math.round(box.left + (box.width - w) / 2),
    top: Math.round(box.top + (box.height - h) / 2),
    width: w,
    height: h,
  };
}

function readImageNaturalSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || !src) {
      resolve(null);
      return;
    }
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/** @deprecated full-bleed caused overshoot zoom — use galleryImageRect */
function fullHeroRect(): ThumbRect {
  return galleryImageRect();
}

/** Wraps the markdown tree so all MessageImage children share a gallery. */
export function ImageGalleryProvider({ children }: { children: ReactNode }) {
  const imagesRef = useRef<GalleryImage[]>([]);
  const keysRef = useRef(new Set<string>());
  const [lightbox, setLightbox] = useState<{
    images: GalleryImage[];
    index: number;
    origin: ThumbRect | null;
    openKey: string;
  } | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const hiddenKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setPortalRoot(getLightboxRoot());
  }, []);

  const clearHiddenThumb = useCallback(() => {
    if (hiddenKeyRef.current) {
      setThumbHidden(hiddenKeyRef.current, false);
      hiddenKeyRef.current = null;
    }
  }, []);

  const register = useCallback((key: string, resolvedSrc: string, alt: string) => {
    if (keysRef.current.has(key)) {
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

  const openAt = useCallback((key: string, origin?: ThumbRect | null) => {
    const idx = imagesRef.current.findIndex((img) => img.key === key);
    if (idx < 0) return;
    const measured = origin ?? measureThumbRect(key);
    clearHiddenThumb();
    hiddenKeyRef.current = key;
    setThumbHidden(key, true);
    setLightbox({
      images: [...imagesRef.current],
      index: idx,
      origin: measured,
      openKey: key,
    });
  }, [clearHiddenThumb]);

  const closeLightbox = useCallback(() => {
    clearHiddenThumb();
    setLightbox(null);
  }, [clearHiddenThumb]);

  const ctx = useMemo<ImageGalleryCtx>(() => ({ register, unregister, openAt }), [register, unregister, openAt]);

  const host = portalRoot ?? (typeof document !== 'undefined' ? getLightboxRoot() : null);
  const lightboxNode = lightbox && host
    ? createPortal(
        createElement(Lightbox, {
          images: lightbox.images,
          startIndex: lightbox.index,
          origin: lightbox.origin,
          openKey: lightbox.openKey,
          onClose: closeLightbox,
          onActiveKeyChange: (key: string) => {
            // Keep the matching grid thumb hidden while browsing the gallery
            if (hiddenKeyRef.current && hiddenKeyRef.current !== key) {
              setThumbHidden(hiddenKeyRef.current, false);
            }
            hiddenKeyRef.current = key;
            setThumbHidden(key, true);
          },
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

/* ── Lightbox with shared-element open/close + swipe ───────────────── */

const LIGHTBOX_SHELL: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100vw',
  height: '100vh',
  maxWidth: '100vw',
  maxHeight: '100vh',
  margin: 0,
  padding: 0,
  border: 0,
  zIndex: 2147483000,
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
  // No backdrop-filter blur — solid dim only
  background: 'transparent',
};

function Lightbox({
  images,
  startIndex,
  origin,
  openKey,
  onClose,
  onActiveKeyChange,
}: {
  images: GalleryImage[];
  startIndex: number;
  origin: ThumbRect | null;
  openKey: string;
  onClose: () => void;
  onActiveKeyChange?: (key: string) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState(viewportBoxNow);
  const [slideWidth, setSlideWidth] = useState(0);

  // opening | open | dragging | settling | dismissing
  const [phase, setPhase] = useState<'opening' | 'open' | 'dragging' | 'settling' | 'dismissing'>(
    origin ? 'opening' : 'open',
  );
  const [backdrop, setBackdrop] = useState(origin ? 0 : 0.92);
  const [hero, setHero] = useState<{ rect: ThumbRect; radius: string; fit: 'cover' | 'contain' } | null>(
    origin
      ? { rect: origin, radius: readBorderRadius(openKey), fit: 'cover' }
      : null,
  );
  const [showTrack, setShowTrack] = useState(!origin);
  const [chromeOn, setChromeOn] = useState(!origin);

  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const axisLock = useRef<'x' | 'y' | null>(null);
  const closedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const openOriginRef = useRef(origin);

  const activeKey = images[index]?.key ?? openKey;

  const prev = useCallback(() => {
    setIndex((i) => {
      const n = Math.max(0, i - 1);
      const k = images[n]?.key;
      if (k) onActiveKeyChange?.(k);
      return n;
    });
  }, [images, onActiveKeyChange]);

  const next = useCallback(() => {
    setIndex((i) => {
      const n = Math.min(images.length - 1, i + 1);
      const k = images[n]?.key;
      if (k) onActiveKeyChange?.(k);
      return n;
    });
  }, [images, onActiveKeyChange]);

  // Body scroll lock
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    body.dataset.lightboxOpen = 'true';
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      delete body.dataset.lightboxOpen;
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // Viewport tracking
  useEffect(() => {
    const apply = () => {
      setVp(viewportBoxNow());
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

  // Shared-element OPEN: thumb → gallery image frame (not full-bleed), then track
  useEffect(() => {
    if (phase !== 'opening' || !origin) return;
    let cancelled = false;
    const src = images[startIndex]?.resolvedSrc ?? images[0]?.resolvedSrc ?? '';

    const run = async () => {
      const natural = await readImageNaturalSize(src);
      if (cancelled) return;
      const target = galleryImageRect(natural?.w, natural?.h);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          setBackdrop(0.92);
          // End at the same size the swipe gallery will show — no extra zoom
          setHero({
            rect: target,
            radius: '0px',
            fit: 'fill', // rect already object-fit:contain sized
          });
          setShowTrack(true);
          setChromeOn(true);
        });
      });
      window.setTimeout(() => {
        if (cancelled) return;
        setHero(null);
        setPhase('open');
        setShowTrack(true);
      }, OPEN_MS + 20);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [phase, origin, images, startIndex]);

  // Hard guarantee: never keep a hero layer while browsing/swiping
  useEffect(() => {
    if (phase === 'open' || phase === 'dragging' || phase === 'settling') {
      setHero((h) => (h ? null : h));
      setShowTrack(true);
    }
  }, [phase]);

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    onClose();
  }, [onClose]);

  useEffect(() => () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const beginDismiss = useCallback((dragOffsetY = 0) => {
    if (closedRef.current || phase === 'dismissing') return;
    const key = images[index]?.key ?? openKey;
    const target = measureThumbRect(key) ?? openOriginRef.current;

    setPhase('dismissing');
    setChromeOn(false);
    setShowTrack(false);
    setDragX(0);
    setDragY(0);

    // Prefer the on-screen gallery image box (exact swipe-gallery size)
    let frame = galleryImageRect();
    const liveImg = containerRef.current?.querySelector(
      '.hm-md-img-lightbox__slide img.hm-md-img-lightbox__img',
    ) as HTMLImageElement | null;
    if (liveImg) {
      const b = liveImg.getBoundingClientRect();
      if (b.width >= 2 && b.height >= 2) {
        frame = { left: b.left, top: b.top, width: b.width, height: b.height };
      } else if (liveImg.naturalWidth > 0 && liveImg.naturalHeight > 0) {
        frame = galleryImageRect(liveImg.naturalWidth, liveImg.naturalHeight);
      }
    }

    const startRect: ThumbRect = {
      left: frame.left,
      top: frame.top + dragOffsetY,
      width: frame.width,
      height: frame.height,
    };
    setHero({
      rect: startRect,
      radius: '0px',
      fit: 'fill',
    });
    setBackdrop(Math.max(0, 0.92 * (1 - Math.min(1, Math.abs(dragOffsetY) / (Math.max(frame.height, 1) * 0.4)))));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (target) {
          setHero({
            rect: target,
            radius: readBorderRadius(key),
            fit: 'cover',
          });
        } else {
          const dir = dragOffsetY === 0 ? 1 : Math.sign(dragOffsetY) || 1;
          const vp = viewportBoxNow();
          setHero({
            rect: {
              left: frame.left,
              top: frame.top + dir * vp.height,
              width: frame.width,
              height: frame.height,
            },
            radius: '0px',
            fit: 'fill',
          });
        }
        setBackdrop(0);
      });
    });

    closeTimerRef.current = window.setTimeout(finishClose, CLOSE_MS + 40);
  }, [finishClose, images, index, openKey, phase]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        beginDismiss(0);
        return;
      }
      if (phase === 'dismissing' || phase === 'opening') return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginDismiss, phase, prev, next]);

  function onTouchStart(e: React.TouchEvent) {
    if (phase === 'dismissing' || phase === 'opening' || closedRef.current) return;
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    axisLock.current = null;
    setPhase('dragging');
    setDragX(0);
    setDragY(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragStart.current || phase === 'dismissing' || phase === 'opening' || closedRef.current) return;
    const dx = e.touches[0].clientX - dragStart.current.x;
    const dy = e.touches[0].clientY - dragStart.current.y;

    if (!axisLock.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisLock.current = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }

    if (axisLock.current === 'y') {
      const h = Math.max(vp.height, 1);
      const limit = h * 0.55;
      let adjY = dy;
      if (Math.abs(adjY) > limit) {
        const excess = Math.abs(adjY) - limit;
        adjY = Math.sign(adjY) * (limit + excess * 0.28);
      }
      setDragY(adjY);
      setDragX(0);
      // Live dim while dragging down/up
      const p = Math.min(1, Math.abs(adjY) / (h * 0.38));
      setBackdrop(Math.max(0.35, 0.92 * (1 - p * 0.65)));
      return;
    }

    let adjX = dx;
    const atEdge = (adjX > 0 && index === 0) || (adjX < 0 && index === images.length - 1);
    if (atEdge) adjX = adjX * 0.3;
    setDragX(adjX);
    setDragY(0);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!dragStart.current || phase === 'dismissing' || phase === 'opening' || closedRef.current) return;
    const dx = e.changedTouches[0].clientX - dragStart.current.x;
    const dy = e.changedTouches[0].clientY - dragStart.current.y;
    const elapsed = Math.max(1, Date.now() - dragStart.current.time);
    const axis = axisLock.current;
    dragStart.current = null;
    axisLock.current = null;

    if (axis === 'y') {
      const velocityY = Math.abs(dy) / elapsed;
      if (Math.abs(dy) > 72 || (velocityY > 0.4 && Math.abs(dy) > 24)) {
        beginDismiss(dy);
        return;
      }
      setPhase('settling');
      setDragY(0);
      setDragX(0);
      setBackdrop(0.92);
      window.setTimeout(() => setPhase((p) => (p === 'settling' ? 'open' : p)), 280);
      return;
    }

    setPhase('settling');
    setDragX(0);
    setDragY(0);
    window.setTimeout(() => setPhase((p) => (p === 'settling' ? 'open' : p)), 280);
    const velocityX = Math.abs(dx) / elapsed;
    if ((Math.abs(dx) > 60 || velocityX > 0.3) && Math.abs(dx) > 20) {
      if (dx < 0) next();
      else prev();
    }
  }

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target !== containerRef.current) return;
    if (phase === 'dismissing' || phase === 'opening') return;
    beginDismiss(0);
  }

  if (!images[index]) return null;

  const widthPx = slideWidth || vp.width;
  const animatingMorph = phase === 'opening' || phase === 'dismissing';
  const fingerDown = phase === 'dragging';
  const trackTransition = fingerDown
    ? 'none'
    : phase === 'settling'
      ? `transform 280ms ${EASE_OUT}`
      : `transform 320ms ${EASE_OUT}`;

  const shellStyle: React.CSSProperties = {
    ...LIGHTBOX_SHELL,
    top: vp.top,
    left: vp.left,
    width: vp.width,
    height: vp.height,
    right: 'auto',
    bottom: 'auto',
    maxWidth: vp.width,
    maxHeight: vp.height,
    background: `rgba(0, 0, 0, ${backdrop})`,
    transition: fingerDown
      ? 'none'
      : `background ${animatingMorph ? (phase === 'opening' ? OPEN_MS : CLOSE_MS) : 220}ms ${EASE_OUT}`,
  };

  const heroStyle: React.CSSProperties | undefined = hero
    ? {
        position: 'fixed',
        left: hero.rect.left,
        top: hero.rect.top,
        width: hero.rect.width,
        height: hero.rect.height,
        objectFit: hero.fit,
        borderRadius: hero.radius,
        margin: 0,
        padding: 0,
        zIndex: 2147483002,
        pointerEvents: 'none',
        boxShadow: phase === 'opening' || phase === 'dismissing'
          ? '0 8px 40px rgba(0,0,0,0.35)'
          : 'none',
        transition: fingerDown
          ? 'none'
          : [
              `left ${phase === 'opening' ? OPEN_MS : CLOSE_MS}ms ${EASE_OUT}`,
              `top ${phase === 'opening' ? OPEN_MS : CLOSE_MS}ms ${EASE_OUT}`,
              `width ${phase === 'opening' ? OPEN_MS : CLOSE_MS}ms ${EASE_OUT}`,
              `height ${phase === 'opening' ? OPEN_MS : CLOSE_MS}ms ${EASE_OUT}`,
              `border-radius ${phase === 'opening' ? OPEN_MS : CLOSE_MS}ms ${EASE_OUT}`,
            ].join(', '),
        willChange: 'left, top, width, height, border-radius',
      }
    : undefined;

  const chromeOpacity = chromeOn && !fingerDown && phase !== 'dismissing' && Math.abs(dragY) < 12
    ? 1
    : chromeOn
      ? Math.max(0, 1 - Math.min(1, Math.abs(dragY) / 120))
      : 0;

  const img = images[index];
  // Hero is ONLY for shared-element open/close — never while swiping the gallery
  const heroActive = Boolean(hero) && (phase === 'opening' || phase === 'dismissing');

  return createElement('div', {
    ref: containerRef,
    className: `hm-md-img-lightbox hm-md-img-lightbox--${phase}`,
    role: 'dialog',
    'aria-modal': true,
    'aria-label': 'Image viewer',
    style: shellStyle,
    onClick: onBackdropClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTransitionEnd: (e: React.TransitionEvent) => {
      if (phase !== 'dismissing') return;
      if (e.propertyName === 'background' || e.propertyName === 'left' || e.propertyName === 'top' || e.propertyName === 'width') {
        finishClose();
      }
    },
  },
    // Shared-element hero (open from grid / close back to grid) — hidden during swipe
    heroActive && hero && img && createElement('img', {
      src: phase === 'dismissing' ? img.resolvedSrc : (images[startIndex]?.resolvedSrc ?? img.resolvedSrc),
      alt: img.alt,
      className: 'hm-md-img-lightbox__hero',
      draggable: false,
      style: heroStyle,
      onTransitionEnd: (e: React.TransitionEvent) => {
        if (phase !== 'dismissing') return;
        if (e.propertyName === 'left' || e.propertyName === 'width' || e.propertyName === 'top') {
          e.stopPropagation();
          finishClose();
        }
      },
    }),

    // Counter
    images.length > 1 && createElement('span', {
      className: 'hm-md-img-lightbox__counter',
      style: {
        opacity: chromeOpacity,
        transition: `opacity 200ms ${EASE_OUT}`,
        pointerEvents: 'none',
      },
    }, `${index + 1} / ${images.length}`),

    index > 0 && createElement('button', {
      type: 'button',
      className: 'hm-md-img-lightbox__nav hm-md-img-lightbox__nav--prev',
      style: {
        opacity: chromeOpacity,
        transition: `opacity 200ms ${EASE_OUT}`,
        pointerEvents: phase === 'dismissing' || phase === 'opening' ? 'none' : undefined,
      },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (phase === 'open' || phase === 'settling' || phase === 'dragging') prev(); },
      'aria-label': 'Previous image',
    },
      createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M15 18l-6-6 6-6' }),
      ),
    ),

    // Gallery track — sole image surface while open / dragging / settling
    showTrack && createElement('div', {
      className: 'hm-md-img-lightbox__track',
      style: {
        transform: `translate3d(${(-index * widthPx) + dragX}px, ${dragY}px, 0) scale(${1 - Math.min(0.06, Math.abs(dragY) / Math.max(vp.height, 1) * 0.12)})`,
        transition: trackTransition,
        width: widthPx > 0 ? `${images.length * widthPx}px` : undefined,
        opacity: phase === 'dismissing' ? 0 : (phase === 'opening' ? 0 : 1),
        // Hide under hero only during morph phases
        visibility: heroActive ? 'hidden' : 'visible',
        pointerEvents: heroActive || phase === 'dismissing' ? 'none' : 'auto',
      },
    },
      ...images.map((gImg) =>
        createElement('div', {
          key: gImg.key,
          className: 'hm-md-img-lightbox__slide',
          style: widthPx > 0 ? { flex: `0 0 ${widthPx}px`, width: widthPx } : undefined,
        },
          createElement('img', {
            src: gImg.resolvedSrc,
            alt: gImg.alt,
            className: 'hm-md-img-lightbox__img',
            draggable: false,
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          }),
        ),
      ),
    ),

    index < images.length - 1 && createElement('button', {
      type: 'button',
      className: 'hm-md-img-lightbox__nav hm-md-img-lightbox__nav--next',
      style: {
        opacity: chromeOpacity,
        transition: `opacity 200ms ${EASE_OUT}`,
        pointerEvents: phase === 'dismissing' || phase === 'opening' ? 'none' : undefined,
      },
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (phase === 'open' || phase === 'settling' || phase === 'dragging') next(); },
      'aria-label': 'Next image',
    },
      createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M9 18l6-6-6-6' }),
      ),
    ),

    createElement('button', {
      type: 'button',
      className: 'hm-md-img-lightbox__close',
      style: {
        opacity: chromeOpacity,
        transition: `opacity 200ms ${EASE_OUT}`,
        pointerEvents: phase === 'dismissing' || phase === 'opening' ? 'none' : undefined,
      },
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        beginDismiss(0);
      },
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
      copied ? createElement('span', { className: 'hm-code-block__copy-feedback' }, 'Copied') : null,
    ),
    createElement(
      'pre',
      {
        className: 'hm-code-block__pre',
        onClick: () => void handleCopy(),
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
    copied ? createElement('span', { className: 'hm-copyable__copy-feedback', 'aria-hidden': true }, 'Copied') : null,
  );
}

/* ── MessageImage with gallery integration ─────────────────────────── */

export function MessageImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const gallery = useContext(ImageGalleryContext);
  const keyRef = useRef(`img-${src}-${Math.random().toString(36).slice(2, 8)}`);
  const imgRef = useRef<HTMLImageElement | null>(null);

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
    if (!gallery) return;
    const el = imgRef.current;
    let origin: ThumbRect | null = null;
    if (el) {
      const b = el.getBoundingClientRect();
      if (b.width >= 2 && b.height >= 2) {
        origin = { left: b.left, top: b.top, width: b.width, height: b.height };
      }
    }
    gallery.openAt(keyRef.current, origin);
  }, [gallery]);

  return createElement('span', { className: 'hm-md-img-wrap' },
    createElement('img', {
      ...props,
      ref: imgRef,
      src: resolvedSrc,
      alt: alt || '',
      className: 'hm-md-img',
      loading: 'lazy',
      [GALLERY_KEY_ATTR]: keyRef.current,
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
