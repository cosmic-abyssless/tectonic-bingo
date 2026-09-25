import { useEffect, useState, type ReactNode } from "react";
import { useAnimate, useReducedMotion } from "motion/react";

// OSRS unrolls its unlock popups at a deliberate pace, and so does this: a dot, a line fanning out, a slow scan down.
const DOT_S = 0.3;
const FAN_S = 0.9;
const PAUSE_MS = 150;
const SCAN_S = 1.1;
const HOLD_MS = 5000;
// The card's icon and text fade in once its frame is fully open, and out before it folds away.
const CONTENT_FADE_MS = 250;
// The way out runs the same steps backwards, a little quicker.
const OUT = 0.7;
// However the animation goes, the popup must move on — a stuck one would block the whole queue.
const WATCHDOG_MS = (DOT_S + FAN_S + SCAN_S) * 2000 + PAUSE_MS * 2 + CONTENT_FADE_MS * 2 + HOLD_MS + 3000;

// Room around the card for its shadow, which the scan uncovers along with the card.
const PAD = 12;
// The card's top edge (see the AchievementUnlockCard slot in themes/slots.ts): what the dot and the line show.
const EDGE = 3;
const DOT = 8;

const inset = (top: number, right: number, bottom: number, left: number) => `inset(${top}px ${right}px ${bottom}px ${left}px)`;

/**
 * Reveals one Achievement's unlock card (CONTEXT.md "Achievement") the way OSRS reveals its combat achievement and
 * collection log popups: a dot appears on the card's top edge, fans out left and right into a line the card's full
 * width, then scans downward until the whole card shows. Only the card's frame unrolls: its icon and text fade in once
 * it is fully open (and out again first when it goes). It holds, then goes back the same way. The card itself is the
 * theme's (the AchievementUnlockCard slot); pressing it opens the Achievements modal. `onDone` fires once the whole
 * cycle has finished — the host advances its queue and marks the popup shown from there. Reduced motion: a plain fade.
 */
export function AchievementUnlockReveal({
  label,
  children,
  onOpen,
  onDone,
}: {
  label: string;
  children: (contentShown: boolean) => ReactNode;
  onOpen: () => void;
  onDone: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [contentShown, setContentShown] = useState(!!reducedMotion);
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    timers.push(setTimeout(() => { stopped = true; onDone(); }, WATCHDOG_MS));

    (async () => {
      const el = scope.current;
      if (!el) return onDone();

      if (reducedMotion) {
        setContentShown(true);
        await animate(el, { opacity: [0, 1] }, { duration: 0.2 });
        if (stopped) return;
        await wait(HOLD_MS);
        if (stopped) return;
        await animate(el, { opacity: [1, 0] }, { duration: 0.2 });
        if (!stopped) onDone();
        return;
      }

      // Pixel insets throughout (measured once, the card doesn't resize while it shows), so every step interpolates.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const edgeBottom = height - PAD - EDGE;
      const dot = inset(PAD, (width - DOT) / 2, edgeBottom, (width - DOT) / 2);
      const line = inset(PAD, PAD, edgeBottom, PAD);
      const full = inset(0, 0, 0, 0);
      // Clipped to the dot before the first frame, so the card never shows whole while the dot fades in.
      el.style.clipPath = dot;

      await animate(el, { opacity: [0, 1] }, { duration: DOT_S, ease: "easeOut" });
      if (stopped) return;
      await animate(el, { clipPath: [dot, line] }, { duration: FAN_S, ease: "linear" });
      if (stopped) return;
      await wait(PAUSE_MS);
      if (stopped) return;
      await animate(el, { clipPath: [line, full] }, { duration: SCAN_S, ease: "linear" });
      if (stopped) return;

      // Unclipped while it holds, so a shadow reaching past the padding isn't cut square; clipped again to go.
      el.style.clipPath = "none";
      setContentShown(true);
      await wait(CONTENT_FADE_MS + HOLD_MS);
      if (stopped) return;
      setContentShown(false);
      await wait(CONTENT_FADE_MS);
      if (stopped) return;
      el.style.clipPath = full;

      await animate(el, { clipPath: [full, line] }, { duration: SCAN_S * OUT, ease: "linear" });
      if (stopped) return;
      await wait(PAUSE_MS);
      if (stopped) return;
      await animate(el, { clipPath: [line, dot] }, { duration: FAN_S * OUT, ease: "linear" });
      if (stopped) return;
      await animate(el, { opacity: [1, 0] }, { duration: DOT_S * OUT, ease: "easeIn" });
      if (!stopped) onDone();
    })();

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
    // Plays once per mount — the host remounts a fresh reveal for each achievement in the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // The negative margin keeps the shadow's room from taking up layout (so phone gutters stay 16px).
    <div ref={scope} className="pointer-events-auto -m-3 p-3" style={{ opacity: 0 }}>
      <button type="button" onClick={onOpen} aria-label={label} className="block text-left">
        {children(contentShown)}
      </button>
    </div>
  );
}
