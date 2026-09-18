import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// How far a touch may wander before it's a gesture rather than a tap (px).
const SLOP = 8;
// Velocity is measured over roughly this much of the end of a drag (ms).
const VELOCITY_WINDOW = 90;
const TAP_MAX_MS = 500;

interface EdgeSwipeOptions {
  /** Which way the finger travels to turn the page: -1 = leftward, 1 = rightward. */
  dir: 1 | -1;
  /** A gesture is about to start; return false to refuse it (a turn is in progress). */
  onBegin: () => boolean;
  /** The drag has begun or moved: how far the finger has travelled toward `dir` (>= 0, px) and where it is vertically. At most once per animation frame. */
  onProgress: (travel: number, clientY: number) => void;
  /** The drag ended (or was cancelled by the system): its travel, and its release velocity toward `dir` in px/ms (negative if it was heading back). */
  onEnd: (result: { travel: number; velocity: number; cancelled: boolean }) => void;
  /** The gesture was recognised as vertical: scroll the page under it by this much. */
  onScroll: (dy: number) => void;
  /** The touch was a tap, not a drag. */
  onTap: (at: { x: number; y: number }, zone: HTMLElement) => void;
}

/**
 * Pointer handlers for one page-turning edge zone on a phone: a drag toward
 * the spine turns the page, a vertical drag scrolls the page underneath (the
 * zone covers part of it and takes its touches), and a tap is passed on.
 *
 * Spread the result onto an element with `touch-action: none`. The first
 * ~8 px decide which of the three it is.
 */
export function useEdgeSwipe(options: EdgeSwipeOptions) {
  // Handlers always see the latest options without re-binding.
  const opts = useRef(options);
  opts.current = options;

  const g = useRef<{
    id: number;
    x0: number;
    y0: number;
    lastY: number;
    t0: number;
    mode: "pending" | "turn" | "scroll" | "ignore";
    samples: { t: number; travel: number }[];
    travel: number;
    y: number;
    raf: number;
  } | null>(null);

  useEffect(
    () => () => {
      if (g.current) cancelAnimationFrame(g.current.raf);
    },
    [],
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (g.current || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (!opts.current.onBegin()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lastY: e.clientY,
      t0: e.timeStamp,
      mode: "pending",
      samples: [{ t: e.timeStamp, travel: 0 }],
      travel: 0,
      y: e.clientY,
      raf: 0,
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (s.mode === "pending") {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      s.mode = Math.abs(dy) > Math.abs(dx) ? "scroll" : Math.sign(dx) === opts.current.dir ? "turn" : "ignore";
    }
    if (s.mode === "scroll") {
      opts.current.onScroll(s.lastY - e.clientY);
      s.lastY = e.clientY;
      return;
    }
    if (s.mode !== "turn") return;
    s.travel = Math.max(0, dx * opts.current.dir);
    s.y = e.clientY;
    s.samples.push({ t: e.timeStamp, travel: s.travel });
    while (s.samples.length > 2 && e.timeStamp - s.samples[0]!.t > VELOCITY_WINDOW) s.samples.shift();
    if (!s.raf) {
      s.raf = requestAnimationFrame(() => {
        s.raf = 0;
        opts.current.onProgress(s.travel, s.y);
      });
    }
  }, []);

  const finish = useCallback((e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    g.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (s.mode === "turn") {
      cancelAnimationFrame(s.raf);
      opts.current.onProgress(s.travel, s.y);
      // A finger that paused before lifting isn't a flick: sample the release itself.
      s.samples.push({ t: e.timeStamp, travel: s.travel });
      while (s.samples.length > 2 && e.timeStamp - s.samples[0]!.t > VELOCITY_WINDOW) s.samples.shift();
      const first = s.samples[0]!;
      const last = s.samples[s.samples.length - 1]!;
      const span = last.t - first.t;
      opts.current.onEnd({ travel: s.travel, velocity: span > 0 ? (last.travel - first.travel) / span : 0, cancelled });
      return;
    }
    if (s.mode === "pending" && !cancelled && e.timeStamp - s.t0 < TAP_MAX_MS) {
      opts.current.onTap({ x: e.clientX, y: e.clientY }, e.currentTarget);
    }
    // Anything that began (onBegin) but never became a turn hands back to the parent as a cancel.
    opts.current.onEnd({ travel: 0, velocity: 0, cancelled: true });
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
  };
}
