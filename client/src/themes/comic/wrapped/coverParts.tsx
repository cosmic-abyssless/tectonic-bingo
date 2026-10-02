import type { CSSProperties, ReactNode } from "react";
import { getColors, TECTONIC_LOGO } from "../board/colors";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { halftoneUrl } from "../fx/halftoneSheet";
import { burstPoints } from "../ui/Burst";
import { WRAPPED_PAGE_WIDTH } from "./camera";

// The pieces the front and back covers share. Like the share cards (themes/comic/wrapped/WrappedShareCard), a cover is
// printed: always on the newsprint palette, so it reads the same in the light and the dark scheme (the pages inside
// follow the scheme; a printed cover doesn't).

export const COVER = getColors("light");
export const coverShadow = (px: number) => `${px}px ${px}px 0 ${COVER.INK}`;

/** A cover's ground: its colour with rays from a point, and a halftone rising from the foot. */
export function CoverGround({ accent, rays = "72% 58%" }: { accent: string; rays?: string }) {
  const width = WRAPPED_PAGE_WIDTH;
  const height = 630;
  const dots = halftoneUrl(`wrapped-cover-ground:${height}`, { width, height, step: 7, scale: 2, color: "rgb(0 0 0 / 0.22)", tone: (_x, y) => Math.max(0, (y / height - 0.4) / 0.6) ** 1.15 });
  return (
    <>
      <div aria-hidden className="absolute inset-0" style={{ background: accent, backgroundImage: `repeating-conic-gradient(from 0deg at ${rays}, rgb(255 255 255 / 0.17) 0deg 5deg, transparent 5deg 12deg)` }} />
      {dots && <div aria-hidden className="absolute inset-0" style={{ backgroundImage: `url("${dots}")`, backgroundRepeat: "no-repeat", backgroundPosition: "center bottom", backgroundSize: `${width}px ${height}px` }} />}
    </>
  );
}

/** The cover's masthead: the red TECTONIC box, what this is, and the Bingo. */
export function CoverMasthead({ kicker, name, flag }: { kicker: string; name?: string; flag?: ReactNode }) {
  return (
    <div className="relative flex shrink-0 items-stretch" style={{ background: COVER.PAPER_RAISED, borderBottom: `4px solid ${COVER.INK}` }}>
      <div
        className="flex items-center uppercase"
        style={{ background: TECTONIC_LOGO.bg, color: TECTONIC_LOGO.fg, fontFamily: COMIC_LOGO_FONT, fontWeight: 900, fontSize: 30, lineHeight: 1, padding: "6px 10px", borderRight: `4px solid ${COVER.INK}` }}
      >
        Tectonic
      </div>
      <div className="min-w-0 flex-1 px-3 py-1.5">
        <p className="uppercase" style={{ fontFamily: COMIC_FONT, fontSize: 12, letterSpacing: "0.08em", color: COVER.INK_SUBTLE, lineHeight: 1 }}>
          {kicker}
        </p>
        {name && (
          <p className="truncate" style={{ fontFamily: COMIC_FONT, fontSize: name.length > 18 ? 24 : 30, lineHeight: 1.05, color: COVER.INK }}>
            {name}
          </p>
        )}
      </div>
      {flag}
    </div>
  );
}

/** A caption on a cover: a box of `fill`, thick ink border, hard shadow, Bangers capitals; `tilt` knocks it askew. */
export function CoverCaption({ children, fill = COVER.PAPER_RAISED, tilt = 0, size = 16, style }: { children: ReactNode; fill?: string; tilt?: number; size?: number; style?: CSSProperties }) {
  return (
    <div
      className="uppercase"
      style={{ background: fill, border: `3px solid ${COVER.INK}`, boxShadow: coverShadow(3), padding: "4px 10px", fontFamily: COMIC_FONT, fontSize: size, lineHeight: 1.05, letterSpacing: "0.04em", color: COVER.INK, transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }}
    >
      {children}
    </div>
  );
}

/** An SFX starburst, drawn still, with `children` lettered in it. */
export function CoverBurst({ fill = COVER.YELLOW, size, tilt = -8, children }: { fill?: string; size: number; tilt?: number; children: ReactNode }) {
  const points = burstPoints(16, 36, 50, 5);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, transform: `rotate(${tilt}deg)` }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <polygon points={points} fill={COVER.INK} transform="translate(3 3.5)" />
        <polygon points={points} fill={fill} stroke={COVER.INK} strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center uppercase leading-none" style={{ fontFamily: COMIC_FONT, color: COVER.INK }}>
        {children}
      </div>
    </div>
  );
}

/** Cover lettering: white, inked round and dropped, like the share cards' titles. */
export function CoverTitle({ children, size, as: Tag = "h2" }: { children: ReactNode; size: number; as?: "h1" | "h2" }) {
  return (
    <Tag
      style={{
        maxWidth: "100%",
        fontFamily: COMIC_FONT,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 0.98,
        color: COVER.TITLE_FILL,
        WebkitTextStroke: `${Math.max(1.5, size / 28)}px ${COVER.INK}`,
        paintOrder: "stroke fill",
        textShadow: coverShadow(size / 14),
        letterSpacing: "0.02em",
        overflowWrap: "anywhere",
        paddingBottom: size / 12,
        paddingRight: size / 12,
      }}
    >
      {children}
    </Tag>
  );
}

/** How big a Bingo's name is lettered on a cover: the longer, the smaller, so it keeps to a few lines. */
export function coverTitleSize(name: string): number {
  const n = name.length;
  return n <= 10 ? 72 : n <= 16 ? 58 : n <= 24 ? 46 : n <= 34 ? 38 : 32;
}
