import { motion, useReducedMotion } from "motion/react";
import { CaptainEmblem } from "../../../core/ui/CaptainEmblem";
import { inkOn } from "../../../core/draft/teamColor";
import type { OnTheClockProps } from "../../slots";

export function OnTheClockBanner({ teamName, teamColor, captains, pickLabel, isMyTurn, embedded }: OnTheClockProps) {
  const reduced = useReducedMotion();
  const bg = teamColor ?? "var(--color-accent)";
  const ink = teamColor ? inkOn(teamColor) : "var(--color-on-accent)";
  return (
    // Remounted per pick by the caller (key), so the entrance plays on every turn change.
    <motion.div
      initial={reduced ? false : { opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 ${embedded ? "" : "rounded-lg shadow-[0_4px_16px_var(--color-shade)]"}`}
      style={{ backgroundColor: bg, color: ink }}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest opacity-80">{isMyTurn ? "You're on the clock" : "On the clock"}</p>
        <p className="truncate text-2xl font-bold leading-tight" style={{ fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" }}>
          {teamName}
        </p>
        {captains.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm opacity-90">
            {captains.map((name, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <span className="mr-0.5">&amp;</span>}
                <CaptainEmblem co={i > 0} />
                {name}
              </span>
            ))}
          </p>
        )}
      </div>
      <p className="num text-sm font-semibold uppercase tracking-wide">{pickLabel}</p>
    </motion.div>
  );
}
