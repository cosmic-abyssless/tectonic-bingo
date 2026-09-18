import type { CSSProperties, ReactNode } from "react";
import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

/**
 * Rectangular narration caption: yellow (or any) fill, thick ink border,
 * Bangers heading. Used for section headers, notes and metadata blocks.
 */
export function CaptionBox({
  children,
  title,
  tone = "yellow",
  tilt = 0,
  className,
  style,
}: {
  children?: ReactNode;
  title?: ReactNode;
  tone?: "yellow" | "paper" | "blue" | "red" | "green" | "cyan";
  tilt?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { colors } = useComic();
  const fill = {
    yellow: colors.YELLOW_TINT,
    paper: colors.PAPER_RAISED,
    blue: colors.BLUE_TINT,
    red: colors.RED_TINT,
    green: colors.GREEN_TINT,
    cyan: colors.CYAN_TINT,
  }[tone];
  return (
    <div
      className={`relative border-[3px] px-3 py-2 ${className ?? ""}`}
      style={{ background: fill, borderColor: colors.INK, color: colors.INK_BODY, boxShadow: `3px 3px 0 ${colors.INK}`, transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }}
    >
      {title !== undefined && (
        <div className="mb-1 text-lg uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** Small Bangers label chip (e.g. "JUDGED BY MODS", task labels). */
export function InkTag({ children, color, fill, className }: { children: ReactNode; color?: string; fill?: string; className?: string }) {
  const { colors } = useComic();
  return (
    <span
      className={`inline-flex items-center gap-1 border-2 px-1.5 py-px text-sm uppercase leading-none ${className ?? ""}`}
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", borderColor: colors.INK, background: fill ?? colors.PAPER_RAISED, color: color ?? colors.INK }}
    >
      {children}
    </span>
  );
}
