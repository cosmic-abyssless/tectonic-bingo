import { useEffect } from "react";
import { useAnimate, useReducedMotion } from "motion/react";
import type { MyAchievement } from "@bingo/shared";
import { WikiIcon } from "../ui/ItemIcon";

const SPREAD_S = 0.22;
const SCAN_S = 0.32;
const HOLD_MS = 4000;
// However the animation goes, the popup must move on — a stuck one would block the whole queue.
const WATCHDOG_MS = HOLD_MS + 4000;

// A hairline sliver, dead centre — the line the popup "spreads" from before it scans down.
const SLIVER = "inset(calc(50% - 1px) 0% calc(50% - 1px) 0%)";
const FULL = "inset(0% 0% 0% 0%)";
const POINT = "inset(50% 50% 50% 50%)";

/**
 * One Achievement's unlock popup (CONTEXT.md "Achievement"): styled after OSRS's own combat achievement / collection
 * log popups. A thin line spreads out from the middle to full width, then scans downward to reveal the card; it
 * holds, then reverses out. `onDone` fires once the whole cycle (in or out) has finished — the host advances its
 * queue and marks the popup shown from there. Reduced motion: a plain fade, no line/scan.
 */
export function AchievementUnlockCard({ achievement, onOpen, onDone }: { achievement: MyAchievement; onOpen: () => void; onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    // Never leaves the queue stuck on a popup that failed to animate for some reason.
    timers.push(setTimeout(() => { stopped = true; onDone(); }, WATCHDOG_MS));

    (async () => {
      const el = scope.current;
      if (!el) return onDone();

      if (reducedMotion) {
        await animate(el, { opacity: [0, 1] }, { duration: 0.15 });
      } else {
        await animate(el, { clipPath: [POINT, SLIVER], opacity: [0, 1] }, { duration: SPREAD_S, ease: "easeOut" });
        if (stopped) return;
        await animate(el, { clipPath: [SLIVER, FULL] }, { duration: SCAN_S, ease: "easeInOut" });
      }
      if (stopped) return;

      await wait(HOLD_MS);
      if (stopped) return;

      if (reducedMotion) {
        await animate(el, { opacity: [1, 0] }, { duration: 0.15 });
      } else {
        await animate(el, { clipPath: [FULL, SLIVER] }, { duration: SCAN_S * 0.75, ease: "easeIn" });
        if (stopped) return;
        await animate(el, { clipPath: [SLIVER, POINT], opacity: [1, 0] }, { duration: SPREAD_S * 0.75, ease: "easeIn" });
      }
      if (stopped) return;
      onDone();
    })();

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
    // Plays once per mount — the host remounts a fresh card for each achievement in the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scope}
      className="pointer-events-auto w-[min(360px,calc(100vw-32px))]"
      style={{ opacity: 0, clipPath: reducedMotion ? undefined : POINT }}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-md border border-achievement-border bg-achievement-surface p-3 text-left shadow-pop">
        <WikiIcon name={achievement.itemName ?? ""} className="size-9 shrink-0 rounded-sm bg-icon-backdrop p-1 [image-rendering:pixelated]" />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-achievement-title">Achievement unlocked</div>
          <div className="truncate text-sm font-semibold text-achievement-title">{achievement.name}</div>
          <div className="text-xs text-achievement-body">{achievement.description}</div>
        </div>
      </button>
    </div>
  );
}
