import { useEffect, useRef } from 'react';

interface SwipeCallbacks {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

export function useSwipeGesture(
  _elementRef: React.RefObject<HTMLElement | null>,
  callbacks: SwipeCallbacks,
  enabled = true,
): void {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(e: TouchEvent) {
      // Skip if lightbox or another overlay is open
      if (document.body.dataset.lightboxOpen) return;
      const t = e.touches[0];
      if (!t) return;
      touchRef.current = { x: t.clientX, y: t.clientY };
      firedRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (firedRef.current) return;
      const start = touchRef.current;
      if (!start) return;

      const t = e.touches[0];
      if (!t) return;

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;

      // Wait for enough movement
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

      // Abort on vertical swipes
      if (Math.abs(dy) > Math.abs(dx)) {
        touchRef.current = null;
        return;
      }

      // Horizontal swipe detected
      if (dx > 60) {
        firedRef.current = true;
        touchRef.current = null;
        cbRef.current.onSwipeRight?.();
      } else if (dx < -60) {
        firedRef.current = true;
        touchRef.current = null;
        cbRef.current.onSwipeLeft?.();
      }
    }

    function reset() {
      touchRef.current = null;
      firedRef.current = false;
    }

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', reset, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', reset);
      document.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);
}
