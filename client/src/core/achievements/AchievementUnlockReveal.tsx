import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

// OSRS unrolls its unlock popups at a deliberate pace, and so does this: a dot, a line fanning out, a slow scan down.
// Nothing fades: the dot is simply there, and everything else is uncovered by the line and the scan.
const DOT_MS = 300;
const FAN_MS = 900;
const PAUSE_MS = 150;
const SCAN_MS = 1100;
const HOLD_MS = 5000;
// The way out runs the same steps backwards, a little quicker.
const OUT = 0.7;
// However the animation goes, the popup must move on — a stuck one would block the whole queue.
const WATCHDOG_MS = (DOT_MS + FAN_MS + PAUSE_MS + SCAN_MS) * 2 + HOLD_MS + 3000;

// Room around the card for its shadow, which the scan uncovers along with the card.
const PAD = 12;
// How much of the card's top edge the dot and the line show — less than the edge's own 3px (see the
// AchievementUnlockCard slot in themes/slots.ts), so no fill can peek through when the page is scaled.
const EDGE = 2;
const DOT = 8;

type Inset = [top: number, right: number, bottom: number, left: number];
const toClip = ([top, right, bottom, left]: Inset) => `inset(${top}px ${right}px ${bottom}px ${left}px)`;

/**
 * Reveals one Achievement's unlock card (CONTEXT.md "Achievement") the way OSRS reveals its combat achievement and
 * collection log popups: a dot appears on the card's top edge, fans out left and right into a line the card's full
 * width, then scans downward until the whole card shows. It holds, then goes back the same way. The card itself is the
 * theme's (the AchievementUnlockCard slot); pressing it opens the Achievements modal. `onDone` fires once the whole
 * cycle has finished — the host advances its queue and marks the popup shown from there. Reduced motion: it simply
 * appears, holds and goes.
 *
 * The clip is stepped by hand, one requestAnimationFrame at a time, rather than handed to Motion: Motion runs
 * clip-path as a native (WAAPI) animation, which Chrome can composite, and the card flashed uncovered for a frame
 * whenever one of those started or finished. Here the element's own style is the only thing clipping it, always.
 */
export function AchievementUnlockReveal({ label, children, onOpen, onDone }: { label: string; children: ReactNode; onOpen: () => void; onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let frame = 0;
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    timers.push(setTimeout(() => { stopped = true; onDone(); }, WATCHDOG_MS));

    const el = ref.current;
    if (!el) {
      onDone();
      return;
    }

    // Linear, like the game's: each frame sets the clip for how far through the step we are.
    const tween = (from: Inset, to: Inset, ms: number) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const step = (now: number) => {
          if (stopped) return;
          const t = Math.min(1, (now - start) / ms);
          el.style.clipPath = toClip(from.map((v, i) => v + (to[i]! - v) * t) as Inset);
          if (t < 1) frame = requestAnimationFrame(step);
          else resolve();
        };
        frame = requestAnimationFrame(step);
      });

    (async () => {
      if (reducedMotion) {
        el.style.opacity = "1";
        await wait(HOLD_MS);
        if (stopped) return;
        el.style.opacity = "0";
        onDone();
        return;
      }

      // Measured once — the card doesn't resize while it shows.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const edgeBottom = height - PAD - EDGE;
      const dot: Inset = [PAD, (width - DOT) / 2, edgeBottom, (width - DOT) / 2];
      const line: Inset = [PAD, PAD, edgeBottom, PAD];
      const full: Inset = [0, 0, 0, 0];

      // Clipped to the dot before it is made visible, so nothing but the dot ever shows first.
      el.style.clipPath = toClip(dot);
      el.style.opacity = "1";
      await wait(DOT_MS);
      if (stopped) return;
      await tween(dot, line, FAN_MS);
      if (stopped) return;
      await wait(PAUSE_MS);
      if (stopped) return;
      await tween(line, full, SCAN_MS);
      if (stopped) return;

      // Unclipped while it holds, so a shadow reaching past the padding isn't cut square; clipped again to go.
      el.style.clipPath = "none";
      await wait(HOLD_MS);
      if (stopped) return;
      el.style.clipPath = toClip(full);

      await tween(full, line, SCAN_MS * OUT);
      if (stopped) return;
      await wait(PAUSE_MS);
      if (stopped) return;
      await tween(line, dot, FAN_MS * OUT);
      if (stopped) return;
      await wait(DOT_MS * OUT);
      if (stopped) return;
      el.style.opacity = "0";
      onDone();
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
    };
    // Plays once per mount — the host remounts a fresh reveal for each achievement in the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // The negative margin keeps the shadow's room from taking up layout (so phone gutters stay 16px).
    <div ref={ref} className="pointer-events-auto -m-3 p-3" style={{ opacity: 0 }}>
      <button type="button" onClick={onOpen} aria-label={label} className="block text-left">
        {children}
      </button>
    </div>
  );
}
