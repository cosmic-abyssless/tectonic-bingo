import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Touch scrolling done by hand, for the pages of the book on a phone. iOS
// won't start a native scroll in an overflow box that sits inside the book's
// 3D-transformed leaves (the touch lands on it, but nothing scrolls and nothing
// is cancelled), so the page's scroller takes its touches (`touch-action: none`)
// and moves itself.

const SLOP = 8;
const VELOCITY_WINDOW = 100; // ms of the end of a drag that a fling's speed is measured over
const TIME_CONSTANT = 325; // ms — how quickly a fling loses speed
const MIN_SPEED = 0.02; // px/ms — under this a fling stops

const flings = new WeakMap<HTMLElement, number>();

export function stopFling(el: HTMLElement) {
  const id = flings.get(el);
  if (id !== undefined) cancelAnimationFrame(id);
  flings.delete(el);
}

/** Keeps `el` scrolling after a release, slowing down as it goes. `velocity` is scrollTop px per ms. */
export function fling(el: HTMLElement, velocity: number) {
  stopFling(el);
  if (Math.abs(velocity) < MIN_SPEED) return;
  let v = velocity;
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    const before = el.scrollTop;
    el.scrollTop = before + v * dt;
    v *= Math.exp(-dt / TIME_CONSTANT);
    if (Math.abs(v) < MIN_SPEED || el.scrollTop === before) flings.delete(el);
    else flings.set(el, requestAnimationFrame(step));
  };
  flings.set(el, requestAnimationFrame(step));
}

/** Speed (scrollTop px/ms) of a drag from its recent samples of `[time, scrollTop]`. */
export function releaseVelocity(samples: [number, number][], now: number) {
  const recent = samples.filter(([t]) => now - t <= VELOCITY_WINDOW);
  if (recent.length < 2) return 0;
  const [t0, y0] = recent[0]!;
  const [t1, y1] = recent[recent.length - 1]!;
  return t1 > t0 ? (y1 - y0) / (t1 - t0) : 0;
}

/**
 * Pointer handlers that scroll their own element by touch drag, with a fling
 * on release. Spread them on a scroller with `touch-action: none`. Only
 * touch and pen are handled; a mouse keeps the wheel and scrollbar.
 */
export function useDragScroll(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef<{ id: number; y0: number; top0: number; dragging: boolean; samples: [number, number][] } | null>(null);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) stopFling(el);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !e.isPrimary || e.pointerType === "mouse") return;
      stopFling(e.currentTarget);
      g.current = { id: e.pointerId, y0: e.clientY, top0: e.currentTarget.scrollTop, dragging: false, samples: [[e.timeStamp, e.currentTarget.scrollTop]] };
    },
    [enabled],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dy = s.y0 - e.clientY;
    if (!s.dragging) {
      if (Math.abs(dy) < SLOP) return;
      s.dragging = true;
      // From here on the drag is this element's, wherever the finger goes. (Not before, so a tap on a
      // row still reaches the row.)
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.currentTarget.scrollTop = s.top0 + dy;
    s.samples.push([e.timeStamp, e.currentTarget.scrollTop]);
    while (s.samples.length > 2 && e.timeStamp - s.samples[0]![0] > VELOCITY_WINDOW) s.samples.shift();
  }, []);

  const finish = useCallback((e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    g.current = null;
    if (!s.dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!cancelled) fling(e.currentTarget, releaseVelocity([...s.samples, [e.timeStamp, e.currentTarget.scrollTop]], e.timeStamp));
  }, []);

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
    },
  };
}
