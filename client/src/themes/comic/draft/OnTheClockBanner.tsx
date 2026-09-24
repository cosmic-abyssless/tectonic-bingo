import { motion, useReducedMotion } from "motion/react";
import { CrownIcon } from "../../../core/ui/icons";
import { inkOn } from "../../../core/draft/teamColor";
import type { OnTheClockProps } from "../../slots";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";

// A comic caption box: thick ink border, hard offset shadow, and a tilted "ON THE CLOCK!" sticker that
// stamps in on every turn change.
export function OnTheClockBanner({ teamName, teamColor, captains, pickLabel, isMyTurn, embedded }: OnTheClockProps) {
  const { colors } = useComic();
  const reduced = useReducedMotion();
  const bg = teamColor ?? colors.YELLOW;
  const ink = teamColor ? inkOn(teamColor) : colors.ON_YELLOW;
  if (embedded) {
    // The top strip of the Teams panel: the team's colour edge to edge, ruled off from the rosters below, the sticker
    // hanging over the panel's top-left corner as on the standalone banner, and the team name sliding in on every turn.
    return (
      <div
        role="status"
        aria-live="polite"
        className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-[3px] px-4 pb-3 pt-5"
        style={{ backgroundColor: bg, color: ink, borderColor: colors.LINE }}
      >
        <motion.span
          initial={reduced ? false : { scale: 2.2, rotate: 8, opacity: 0 }}
          animate={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 16, delay: 0.1 }}
          className="absolute -top-4 left-3 rounded-sm border-[3px] px-2 py-0.5 text-sm uppercase tracking-wider"
          style={{ fontFamily: COMIC_FONT, background: colors.PAPER, color: colors.INK, borderColor: colors.LINE }}
        >
          {isMyTurn ? "Your pick!" : "On the clock!"}
        </motion.span>
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            className="min-w-0"
            initial={reduced ? false : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
          >
            <p className="truncate text-3xl uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT }}>
              {teamName}
            </p>
            {captains.length > 0 && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm font-semibold">
                <CrownIcon size={13} aria-label="Captains" />
                {captains.join(" & ")}
              </p>
            )}
          </motion.div>
        </div>
        <p className="num text-lg uppercase tracking-wide" style={{ fontFamily: COMIC_FONT }}>
          {pickLabel}
        </p>
      </div>
    );
  }
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: -40, rotate: -1.5 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      role="status"
      aria-live="polite"
      className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-sm border-[4px] px-5 pb-3 pt-5"
      style={{ backgroundColor: bg, color: ink, borderColor: colors.LINE, boxShadow: `6px 6px 0 ${colors.LINE}` }}
    >
      <motion.span
        initial={reduced ? false : { scale: 2.2, rotate: 8, opacity: 0 }}
        animate={{ scale: 1, rotate: -3, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 16, delay: 0.1 }}
        className="absolute -top-3 left-4 rounded-sm border-[3px] px-2 py-0.5 text-sm uppercase tracking-wider"
        style={{ fontFamily: COMIC_FONT, background: colors.PAPER, color: colors.INK, borderColor: colors.LINE }}
      >
        {isMyTurn ? "Your pick!" : "On the clock!"}
      </motion.span>
      <div className="min-w-0">
        <p className="truncate text-4xl uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT }}>
          {teamName}
        </p>
        {captains.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm font-semibold">
            <CrownIcon size={13} aria-label="Captains" />
            {captains.join(" & ")}
          </p>
        )}
      </div>
      <p className="num text-lg uppercase tracking-wide" style={{ fontFamily: COMIC_FONT }}>
        {pickLabel}
      </p>
    </motion.div>
  );
}
