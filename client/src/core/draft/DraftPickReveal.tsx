import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useAnimate } from "motion/react";
import { useSlot } from "../../themes/context";
import { flightTo, isOnScreen, type Box, type PendingPick } from "./revealMath";

const HOLD_MS = 1150;
const HURRIED_HOLD_MS = 450;
const FLIGHT_S = 0.7;
const WATCHDOG_MS = 8000;

const boxOf = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });

/**
 * The moment a player is drafted: a shape with their name(s) pops onto the middle of the screen, holds for a
 * beat, then flies down to the spot on their new team's roster and settles into it. The shape itself comes from the
 * theme (the DraftPickBurst slot); the timing and the flight are the same everywhere. The roster entry it lands on
 * is found by `data-team-id` and `data-pick-number` (see TeamRoster).
 */
export function DraftPickReveal({
  pick,
  names,
  teamName,
  teamColor,
  hurry,
  onArrive,
  onDone,
}: {
  pick: PendingPick;
  names: string[];
  teamName: string;
  teamColor: string | null;
  /** More picks are waiting behind this one: don't linger. */
  hurry: boolean;
  /** The shape has reached the roster slot: show the entry underneath. */
  onArrive: () => void;
  onDone: () => void;
}) {
  const Burst = useSlot("DraftPickBurst");
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    let stopped = false;
    const running: ReturnType<typeof animate>[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const play = (controls: ReturnType<typeof animate>) => {
      running.push(controls);
      return controls;
    };
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    // However it goes, the roster entry must not stay hidden.
    timers.push(
      setTimeout(() => {
        stopped = true;
        onArrive();
        onDone();
      }, WATCHDOG_MS),
    );

    (async () => {
      const shape = scope.current;
      if (!shape) return onDone();

      // Pop in.
      await Promise.all([
        play(animate(shape, { scale: [0.2, 1], rotate: [-18, -5] }, { type: "spring", stiffness: 480, damping: 15, mass: 0.9 })),
        play(animate(shape, { opacity: [0, 1] }, { duration: 0.12 })),
      ]);
      if (stopped) return;
      await wait(hurry ? HURRIED_HOLD_MS : HOLD_MS);
      if (stopped) return;

      // Fly to the roster slot and settle: as it lands the entry appears and the shape fades away over it.
      setFlying(true);
      const slot = document.querySelector<HTMLElement>(`[data-team-id="${pick.teamId}"][data-pick-number="${pick.pickNumber}"]`);
      // The rosters scroll once they are long; bring the new entry into view before measuring where to land.
      slot?.scrollIntoView({ block: "nearest", inline: "nearest" });
      const slotBox = slot ? boxOf(slot.getBoundingClientRect()) : null;
      if (slotBox && isOnScreen(slotBox, { width: window.innerWidth, height: window.innerHeight })) {
        const flight = flightTo(boxOf(shape.getBoundingClientRect()), slotBox);
        timers.push(setTimeout(() => !stopped && onArrive(), FLIGHT_S * 1000 * 0.7));
        await Promise.all([
          play(animate(shape, { x: flight.x, y: flight.y, scale: flight.scale, rotate: 0 }, { duration: FLIGHT_S, ease: [0.22, 1, 0.36, 1] })),
          play(animate(shape, { opacity: [1, 1, 0] }, { duration: FLIGHT_S, times: [0, 0.65, 1] })),
        ]);
      } else {
        // The roster isn't in view: just bow out.
        onArrive();
        await Promise.all([play(animate(shape, { scale: 1.2 }, { duration: 0.25 })), play(animate(shape, { opacity: 0 }, { duration: 0.25 }))]);
      }
      if (stopped) return;
      onArrive();
      onDone();
    })();

    return () => {
      stopped = true;
      for (const c of running) c.stop();
      for (const t of timers) clearTimeout(t);
    };
    // The reveal is for this one pick: it runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div data-testid="draft-reveal" className="pointer-events-none fixed inset-0 z-[70] flex items-start justify-center pt-[16vh]" role="status" aria-live="polite">
      <motion.div className="absolute inset-0 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: flying ? 0 : 1 }} transition={{ duration: flying ? FLIGHT_S * 0.6 : 0.2 }} />
      <div ref={scope} className="relative" style={{ opacity: 0 }}>
        <Burst names={names} teamName={teamName} teamColor={teamColor} />
      </div>
    </div>,
    document.body,
  );
}
