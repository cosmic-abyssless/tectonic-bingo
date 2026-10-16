import type { Transition } from "motion/react";

/** A Rewind popup's usual fade in and out. */
const FADE_S = 0.16;

/**
 * How a Rewind popup comes in and goes. While Play holds it for less than four of its usual fades (most popups at 4x
 * and 8x), the fade shortens to a quarter of the hold and a big one's spring is dropped, so each popup is fully in
 * before the next takes its place. `spring` is the theme's landing for a big one (null for the plain fade).
 */
export function rewindPopupTransition(holdMs: number | null, spring: Transition | null): Transition {
  if (holdMs !== null && holdMs < FADE_S * 4000) return { duration: Math.max(0.04, holdMs / 4000) };
  return spring ?? { duration: FADE_S };
}
