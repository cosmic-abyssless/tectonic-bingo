import type { ReactNode } from "react";
import type { SignificanceTier } from "@bingo/shared";
import type { ComicColors } from "../board/colors";
import { burstPoints } from "../ui/Burst";
import { COMIC_FIGURES_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { Kicker } from "../wrapped/sections/sectionParts-team-bingo";

const BURST = burstPoints(10, 30, 50, 4);

/**
 * A Rewind side panel, as the Wrapped's panels are drawn: raised paper, a thick ink border with a hard shadow, and its
 * name on a yellow kicker knocked askew, with an optional count beside it.
 */
export function RewindPanel({ title, count, children, className = "" }: { title: string; count?: ReactNode; children: ReactNode; className?: string }) {
  const { colors } = useComic();
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 flex-col border-[3px] ${className}`}
      style={{
        background: colors.PAPER_RAISED,
        borderColor: colors.LINE,
        boxShadow: `4px 4px 0 ${colors.SHADOW}`,
        color: colors.INK_BODY,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b-[3px] px-3 pb-2 pt-2.5"
        style={{ borderColor: colors.LINE, background: colors.PAPER }}
      >
        <Kicker tilt={-2}>{title}</Kicker>
        {count !== undefined && (
          <span className="num text-[13px] font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FIGURES_FONT }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** A Team's colour as an ink-ringed dot. */
export function TeamDot({ color, size = 12 }: { color: string | null; size?: number }) {
  const { colors } = useComic();
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full border-2"
      style={{
        width: size,
        height: size,
        background: color ?? colors.INK_SUBTLE,
        borderColor: colors.LINE,
      }}
    />
  );
}

/**
 * A printed band's ground: the Wrapped's (PanelGround), its colour with rays from below one end, and a dot screen fading
 * in towards the other, sized to the band rather than to a Wrapped page.
 */
export function BandGround({ accent, origin = "12% 120%", fadeTo = "right" }: { accent: string; origin?: string; fadeTo?: "left" | "right" }) {
  const fade = `linear-gradient(${fadeTo === "right" ? 90 : 270}deg, transparent 35%, black)`;
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: accent,
          backgroundImage: `repeating-conic-gradient(from 0deg at ${origin}, rgb(255 255 255 / 0.18) 0deg 5deg, transparent 5deg 12deg)`,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgb(0 0 0 / 0.22) 1.3px, transparent 1.9px)",
          backgroundSize: "7px 7px",
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      />
    </>
  );
}

/** The tier's mark: the bigger the Submission, the louder. */
export function TierMark({ tier, fill, colors }: { tier: SignificanceTier; fill: string | null; colors: ComicColors }) {
  if (tier === "huge")
    return (
      <svg viewBox="0 0 100 100" aria-hidden className="size-[18px] overflow-visible">
        <polygon points={BURST} fill={fill ?? colors.RED} stroke={colors.LINE} strokeWidth={9} strokeLinejoin="round" />
      </svg>
    );
  if (tier === "notable")
    return <span aria-hidden className="block size-[9px] rotate-45 border-2" style={{ background: fill ?? colors.YELLOW, borderColor: colors.LINE }} />;
  return <span aria-hidden className="block size-[7px] rounded-full" style={{ background: fill ?? colors.INK_SUBTLE }} />;
}
