import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

/** Jagged starburst polygon (viewBox 0 0 100 100). Deterministic so it renders identically everywhere. */
export function burstPoints(spikes = 14, inner = 34, outer = 50, seed = 3): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    // Small deterministic jitter so spikes look hand-drawn.
    const jitter = ((i * 7 + seed * 13) % 5) - 2;
    const r = (i % 2 === 0 ? outer : inner) + jitter * 0.8;
    pts.push(`${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`);
  }
  return pts.join(" ");
}

/**
 * Sound-effect burst: filled starburst with an ink outline and Bangers text.
 * Sized by the parent (use `className` for width); text scales with the box
 * via container-query units.
 */
export function Burst({
  children,
  fill,
  color,
  rotate = -6,
  spikes = 14,
  animate = false,
  className,
  style,
  textClassName,
}: {
  children: ReactNode;
  fill?: string;
  color?: string;
  rotate?: number;
  spikes?: number;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
  textClassName?: string;
}) {
  const { colors } = useComic();
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`relative aspect-square select-none ${className ?? ""}`}
      style={{ containerType: "inline-size", ...style }}
      initial={animate && !reduced ? { scale: 0.2, rotate: rotate - 12, opacity: 0 } : false}
      animate={{ scale: 1, rotate, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 18, mass: 0.8 }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <polygon points={burstPoints(spikes, 34, 50, 5)} fill={colors.INK} transform="translate(2.5 3)" />
        <polygon points={burstPoints(spikes, 34, 50, 5)} fill={fill ?? colors.YELLOW} stroke={colors.LINE} strokeWidth={3} strokeLinejoin="round" />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center text-center uppercase leading-none ${textClassName ?? ""}`}
        style={{ fontFamily: COMIC_FONT, color: color ?? colors.INK, fontSize: "24cqw", letterSpacing: "0.02em", WebkitTextStroke: color === colors.ON_LOUD ? `0.6px ${colors.LINE}` : undefined }}
      >
        {children}
      </div>
    </motion.div>
  );
}
