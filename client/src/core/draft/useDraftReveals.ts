import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { DraftState } from "@bingo/shared";
import { useWebSocketEvent } from "../../context/WebSocketContext";
import { MAX_QUEUED_REVEALS, expiredPicks, readyPick, type PendingPick } from "./revealMath";

/**
 * Plays a reveal for each draft pick as the server announces it (the `draft_pick` websocket event goes to everyone
 * watching), so every viewer sees the same moment. It only reacts to picks made while the page is open, never to the
 * ones already in the history.
 *
 * A pick's roster entry is hidden from the moment it is announced until the reveal has flown into place, so the
 * player isn't shown twice. Reveals play one at a time; if the draft outruns them (or the tab is in the background,
 * or the viewer asked for reduced motion) the pick simply appears.
 */
export function useDraftReveals(bingoId: string | undefined, state: DraftState | undefined) {
  const reducedMotion = useReducedMotion();
  const [queue, setQueue] = useState<PendingPick[]>([]);
  const [active, setActive] = useState<PendingPick | null>(null);
  const [arrived, setArrived] = useState(false);

  useWebSocketEvent((event) => {
    if (!("bingoId" in event) || event.bingoId !== bingoId) return;
    if (event.type === "draft_pick_undone") {
      // The pick was taken back: forget its reveal, whether it is waiting or already on screen.
      const { pickNumber } = event.payload;
      setQueue((q) => q.filter((p) => p.pickNumber !== pickNumber));
      setActive((a) => (a?.pickNumber === pickNumber ? null : a));
      return;
    }
    if (event.type !== "draft_pick") return;
    if (reducedMotion || document.visibilityState !== "visible") return;
    const { pickNumber, teamId } = event.payload;
    setQueue((q) => (q.length >= MAX_QUEUED_REVEALS || q.some((p) => p.pickNumber === pickNumber) ? q : [...q, { pickNumber, teamId, queuedAt: Date.now() }]));
  });

  useEffect(() => {
    if (!active) setArrived(false);
  }, [active]);

  // Start the next reveal once nothing is playing and the pick's players have loaded into the draft state.
  useEffect(() => {
    if (active || !state) return;
    const next = readyPick(queue, state.picks);
    if (!next) return;
    setQueue((q) => q.filter((p) => p !== next));
    setArrived(false);
    setActive(next);
  }, [active, queue, state]);

  // A pick that never shows up in the state (a failed refetch) shouldn't stay hidden forever.
  const picks = state?.picks;
  useEffect(() => {
    if (queue.length === 0) return;
    const timer = setInterval(() => {
      setQueue((q) => {
        const gone = expiredPicks(q, picks ?? [], Date.now());
        return gone.length > 0 ? q.filter((p) => !gone.includes(p)) : q;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [queue.length, picks]);

  const hiddenPickNumbers = new Set<number>(queue.map((p) => p.pickNumber));
  if (active && !arrived) hiddenPickNumbers.add(active.pickNumber);

  return {
    /** Picks whose roster entries stay hidden until their reveal lands. */
    hiddenPickNumbers,
    /** The reveal playing now, if any. */
    active,
    /** Announced picks still waiting behind it. */
    waiting: queue.length,
    /** The reveal has reached its slot: show the roster entry (the shape is fading out over it). */
    arrive: () => setArrived(true),
    /** The reveal is over. */
    finish: () => {
      setActive(null);
      setArrived(false);
    },
  };
}
