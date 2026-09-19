import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

export type StampKind = "approved" | "completed" | "rejected" | "pending" | "frozen" | "done" | "locked" | "custom";

const TEXT: Record<Exclude<StampKind, "custom">, string> = {
  approved: "APPROVED",
  completed: "COMPLETED",
  rejected: "REJECTED",
  pending: "PENDING",
  frozen: "FROZEN",
  done: "DONE!",
  locked: "LOCKED",
};

/** Rubber-stamp text: double ring, rotated, distressed via a dotted overlay. */
export function Stamp({
  kind,
  children,
  rotate = -12,
  size = "md",
  animate = false,
  className,
  style,
}: {
  kind: StampKind;
  children?: ReactNode;
  rotate?: number;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { colors } = useComic();
  const reduced = useReducedMotion();
  const color = {
    approved: colors.OK,
    completed: colors.OK,
    done: colors.OK,
    rejected: colors.BAD,
    pending: colors.WARN,
    frozen: colors.FROZEN,
    locked: colors.INK_SUBTLE,
    custom: colors.RED,
  }[kind];
  const fontSize = { sm: "text-sm", md: "text-xl", lg: "text-4xl" }[size];
  const pad = { sm: "px-1.5 py-px", md: "px-2 py-0.5", lg: "px-4 py-1" }[size];
  // A stamp is always pressed on top of whatever it marks, so it needs a
  // stacking position. Callers that position it absolutely keep their own.
  // No blend mode: multiply made the ink of anything underneath (card
  // borders, hard shadows) show through the stamp, which read as the stamp
  // being tucked under the border rather than pressed onto the card.
  const positioned = /\b(absolute|fixed|sticky)\b/.test(className ?? "");
  return (
    <motion.span
      aria-hidden={kind !== "custom" ? undefined : true}
      className={`comic-stamp pointer-events-none inline-flex select-none items-center justify-center whitespace-nowrap border-[3px] uppercase leading-none ${positioned ? "" : "relative"} ${fontSize} ${pad} ${className ?? ""}`}
      style={{
        fontFamily: COMIC_FONT,
        letterSpacing: "0.08em",
        color,
        borderColor: color,
        // Outer ring drawn as shadows so the 2px gap between the rings is
        // paper too, not a see-through slit for whatever is underneath.
        boxShadow: `0 0 0 2px ${colors.PAPER_RAISED}, 0 0 0 4px ${color}`,
        background: colors.PAPER_RAISED,
        ...style,
      }}
      // Slammed down: starts big and faint, overshoots slightly, settles.
      initial={animate && !reduced ? { scale: 2, rotate, opacity: 0 } : false}
      animate={{ scale: 1, rotate, opacity: 1 }}
      transition={{ type: "spring", stiffness: 700, damping: 26, mass: 0.6 }}
    >
      {kind === "custom" ? children : TEXT[kind]}
    </motion.span>
  );
}
