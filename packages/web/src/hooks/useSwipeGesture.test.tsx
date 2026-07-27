import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSwipeGesture } from './useSwipeGesture';

function SwipeHarness({
  onSwipeLeft,
  onSwiping,
  onSwipeEnd,
}: {
  onSwipeLeft?: () => void;
  onSwiping?: (dx: number) => void;
  onSwipeEnd?: () => void;
}) {
  useSwipeGesture({ current: null }, {
    ...(onSwipeLeft ? { onSwipeLeft } : {}),
    ...(onSwiping ? { onSwiping } : {}),
    ...(onSwipeEnd ? { onSwipeEnd } : {}),
  });
  return null;
}

function touchEvent(type: string, x: number, y = 0): TouchEvent {
  return new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y } as Touch],
  });
}

describe('useSwipeGesture', () => {
  it('continues reporting drag offsets after crossing the legacy swipe threshold', () => {
    const onSwipeLeft = vi.fn();
    const onSwiping = vi.fn();
    const onSwipeEnd = vi.fn();
    render(<SwipeHarness onSwipeLeft={onSwipeLeft} onSwiping={onSwiping} onSwipeEnd={onSwipeEnd} />);

    document.dispatchEvent(touchEvent('touchstart', 200));
    document.dispatchEvent(touchEvent('touchmove', 140));
    document.dispatchEvent(touchEvent('touchmove', 80));
    document.dispatchEvent(touchEvent('touchmove', 40));
    document.dispatchEvent(touchEvent('touchend', 40));

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwiping).toHaveBeenNthCalledWith(1, -60);
    expect(onSwiping).toHaveBeenNthCalledWith(2, -120);
    expect(onSwiping).toHaveBeenNthCalledWith(3, -160);
    expect(onSwipeEnd).toHaveBeenCalledTimes(1);
  });

  it('does not finish a vertical gesture as a horizontal swipe', () => {
    const onSwipeEnd = vi.fn();
    render(<SwipeHarness onSwipeEnd={onSwipeEnd} />);

    document.dispatchEvent(touchEvent('touchstart', 100, 100));
    document.dispatchEvent(touchEvent('touchmove', 110, 180));
    document.dispatchEvent(touchEvent('touchend', 110, 180));

    expect(onSwipeEnd).not.toHaveBeenCalled();
  });
});
