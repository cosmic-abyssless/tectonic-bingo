import type { CSSProperties, ReactNode } from "react";
import { COMIC_FONT } from "../font";
import { PrintedShade, toneColors, type Tone } from "./tones";
import { useComic } from "./useComic";

/**
 * Rectangular narration caption: a tone's tint (or plain raised paper), thick
 * ink border, Bangers heading, and on a tint the tone's halftone shading (see
 * tones.tsx). Used for section headers, notes and metadata blocks.
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
  tone?: Tone | "paper";
  tilt?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { colors } = useComic();
  const toned = tone === "paper" ? null : toneColors(colors, tone);
  const fill = toned?.tint ?? colors.PAPER_RAISED;
  return (
    <div
      className={`relative border-[3px] px-3 py-2 ${className ?? ""}`}
      style={{ background: fill, borderColor: colors.LINE, color: colors.INK_BODY, boxShadow: `3px 3px 0 ${colors.SHADOW}`, transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }}
    >
      {toned && <PrintedShade ink={toned.loud} />}
      <div className="relative">
        {title !== undefined && (
          <div className="mb-1 text-lg uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Small Bangers label chip (e.g. "JUDGED BY MODS", task labels). */
export function InkTag({ children, color, fill, className }: { children: ReactNode; color?: string; fill?: string; className?: string }) {
  const { colors } = useComic();
  return (
    <span
      className={`inline-flex items-center gap-1 border-2 px-1.5 py-px text-sm uppercase leading-none ${className ?? ""}`}
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", borderColor: colors.LINE, background: fill ?? colors.PAPER_RAISED, color: color ?? colors.INK }}
    >
      {children}
    </span>
  );
}
