import type { CSSProperties, ReactNode } from "react";
import type { WrappedDropModel, WrappedPersonModel, WrappedSectionArtModel } from "../../../../headless/types";
import { WrappedCategoryArt } from "../../../../core/wrapped/WrappedParts";
import { ScreenshotLink } from "../../../../core/submissions/ScreenshotThumb";
import { WikiIcon } from "../../../../core/ui/ItemIcon";
import { TooltipSpan } from "../../../../core/ui/Tooltip";
import { COMIC_FIGURES_FONT, COMIC_FONT } from "../../font";
import { burstPoints } from "../../ui/Burst";
import { onFill } from "../../ui/tones";
import { useComic } from "../../ui/useComic";
import { COVER } from "../coverParts";
import { Gp } from "./sectionParts-you-duo-captain-moderator";

// The pieces the comic Wrapped's Team and The Bingo sections (#421) are drawn from. A section is a few pages; a page is a
// Scene, each of its panels a Reveal. The Reveal brings the frame (the book's panel); everything here is what goes inside:
// a ground printed with rays, caption boxes, bursts, stamps, a person, a drop. Lettering that sits on a printed ground
// (the section splashes) uses the cover's fixed newsprint palette, as the covers do; the rest follows the page's palette.

/**
 * Classes for a Reveal whose panel the section fills edge to edge itself: no padding, and the panel's content stretches to
 * the panel (a splash that grows to fill its page, a cell of a row that is as tall as its neighbour).
 */
export const FULL_PANEL = "wrapped-panel-full flex flex-col overflow-hidden p-0 [&>.wrapped-panel-content]:flex [&>.wrapped-panel-content]:flex-1 [&>.wrapped-panel-content]:flex-col";
/** The same, for a panel with the usual padding. */
export const PADDED_PANEL = "flex flex-col [&>.wrapped-panel-content]:flex [&>.wrapped-panel-content]:flex-1 [&>.wrapped-panel-content]:flex-col";

export const display = (size: number, extra?: CSSProperties): CSSProperties => ({ fontFamily: COMIC_FONT, fontSize: size, lineHeight: 1, letterSpacing: "0.03em", textTransform: "uppercase", fontWeight: 400, ...extra });

/** A Bingo or Team name's size in a lettered title: the longer, the smaller, so it keeps to two lines. */
export function titleSize(text: string, big = 46): number {
  const n = text.length;
  return n <= 12 ? big : n <= 20 ? big * 0.8 : n <= 30 ? big * 0.64 : big * 0.52;
}

/** A printed ground: a colour with rays from a point and a halftone rising from the foot. */
export function PanelGround({ accent, origin = "50% 100%" }: { accent: string; origin?: string }) {
  const fade = "linear-gradient(to top, black, transparent 75%)";
  return (
    <>
      <div aria-hidden className="wrapped-panel-ground absolute inset-0" style={{ background: accent, backgroundImage: `repeating-conic-gradient(from 0deg at ${origin}, rgb(255 255 255 / 0.18) 0deg 5deg, transparent 5deg 12deg)` }} />
      <div
        aria-hidden
        className="wrapped-panel-ground absolute inset-0"
        style={{ backgroundImage: "radial-gradient(rgb(0 0 0 / 0.24) 1.1px, transparent 1.8px)", backgroundSize: "6px 6px", maskImage: fade, WebkitMaskImage: fade }}
      />
    </>
  );
}

/** A small label knocked askew: a panel's kicker. On a printed ground, give `fill` and `ink` from the cover's palette. */
export function Kicker({ children, fill, tilt = -1.5, className = "", dot }: { children: ReactNode; fill?: string; tilt?: number; className?: string; dot?: string | null }) {
  const { colors } = useComic();
  const bg = fill ?? colors.YELLOW;
  return (
    <p data-beat="rise"
      className={`inline-flex max-w-full items-center gap-1.5 self-start border-2 px-2 pt-[3px] pb-px ${className}`}
      style={{ ...display(14, { letterSpacing: "0.08em" }), background: bg, color: onFill(colors, bg), borderColor: colors.LINE, boxShadow: `2px 2px 0 ${colors.SHADOW}`, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {dot && <span aria-hidden className="size-2.5 shrink-0 rounded-full border-[1.5px]" style={{ background: dot, borderColor: colors.LINE }} />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A panel's headline: Bangers capitals in ink. */
export function PanelHeading({ children, size = 32, className = "" }: { children: ReactNode; size?: number; className?: string }) {
  const { colors } = useComic();
  return (
    <h2 data-beat="slam" className={`text-balance ${className}`} style={{ ...display(size), color: colors.INK, paddingRight: size / 14 }}>
      {children}
    </h2>
  );
}

/**
 * A sound-effect word: lettered white with an ink outline and drop, set askew. It is decoration, never one of the
 * section's lines, so it is hidden from a screen reader.
 */
export function Sfx({ children, size = 26, tilt = -8, className = "", style }: { children: ReactNode; size?: number; tilt?: number; className?: string; style?: CSSProperties }) {
  return (
    <span data-beat="pop"
      aria-hidden
      className={`pointer-events-none select-none ${className}`}
      style={{
        ...display(size, { letterSpacing: "0.04em" }),
        color: COVER.YELLOW,
        WebkitTextStroke: `${Math.max(1.5, size / 9)}px ${COVER.INK}`,
        paintOrder: "stroke fill",
        textShadow: `${size / 12}px ${size / 12}px 0 ${COVER.INK}`,
        transform: `rotate(${tilt}deg)`,
        paddingRight: size / 10,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** A starburst with `children` lettered in it; its box is square and sized by the parent (`className`), text by container width. */
export function InkBurst({ children, fill, tilt = -6, spikes = 14, className = "", style }: { children: ReactNode; fill?: string; tilt?: number; spikes?: number; className?: string; style?: CSSProperties }) {
  const { colors } = useComic();
  const points = burstPoints(spikes, 35, 50, 5);
  return (
    <div data-beat="slam" className={`relative aspect-square shrink-0 select-none ${className}`} style={{ containerType: "inline-size", transform: `rotate(${tilt}deg)`, ...style }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <polygon points={points} fill={colors.SHADOW} transform="translate(2.5 3)" />
        <polygon points={points} fill={fill ?? colors.YELLOW} stroke={colors.LINE} strokeWidth={3} strokeLinejoin="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-[16%] text-center" style={{ ...display(24), color: colors.INK, transform: `rotate(${-tilt}deg)` }}>
        <span className="text-balance">{children}</span>
      </div>
    </div>
  );
}

/** The cqw font size that fits a label of this length in an InkBurst. */
export function burstFont(text: string, base = 24): string {
  const n = text.length;
  return `${n <= 3 ? base : n <= 5 ? base * 0.8 : n <= 7 ? base * 0.62 : n <= 9 ? base * 0.5 : base * 0.4}cqw`;
}

/** A rubber stamp: a double ring in `color`, set askew. Unlike the shared Stamp it is not hidden from a screen reader. */
export function StampLabel({ children, color, tilt = -6, size = 16, className = "" }: { children: ReactNode; color: string; tilt?: number; size?: number; className?: string }) {
  const { colors } = useComic();
  return (
    <span data-beat="pop"
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap border-[3px] px-1.5 pt-[3px] pb-px ${className}`}
      style={{ ...display(size, { letterSpacing: "0.06em" }), color, borderColor: color, background: colors.PAPER_RAISED, boxShadow: `0 0 0 2px ${colors.PAPER_RAISED}, 0 0 0 4px ${color}`, transform: `rotate(${tilt}deg)`, margin: 4 }}
    >
      {children}
    </span>
  );
}

/** A number inked big with a colour drop under it, and its label. */
export function Tally({ value, label, size = 56, align = "center" }: { value: ReactNode; label: ReactNode; size?: number; align?: "center" | "start" }) {
  const { colors } = useComic();
  return (
    <div data-beat="slam" className={align === "center" ? "text-center" : "text-left"}>
      <div className="num whitespace-nowrap" style={{ ...display(size), color: colors.INK, textShadow: `${Math.max(2, size / 16)}px ${Math.max(2, size / 16)}px 0 ${colors.YELLOW}`, paddingRight: size / 14 }}>
        {value}
      </div>
      <div className="mt-1.5 text-[13px] leading-tight" style={{ color: colors.INK_BODY }}>
        {label}
      </div>
    </div>
  );
}

/**
 * A person as a comic cast member: a ringed avatar and a name (a quiet "You" beside the viewer's), with an optional line
 * under it. `lettered` letters the name like a title, for a person who is the panel's subject.
 */
export function ComicPerson({ person, size = 36, detail, nameSize = 15, column = false, lettered = false }: { person: WrappedPersonModel; size?: number; detail?: ReactNode; nameSize?: number; column?: boolean; lettered?: boolean }) {
  const { colors } = useComic();
  return (
    <span className={`inline-flex min-w-0 max-w-full gap-2 ${column ? "flex-col items-center text-center" : "items-center"}`}>
      <img
        src={person.avatarUrl}
        alt=""
        loading="lazy"
        className="shrink-0 rounded-full border-[2.5px] object-cover"
        style={{ width: size, height: size, borderColor: colors.LINE, background: colors.PAPER_ALT, boxShadow: `2px 2px 0 ${colors.SHADOW}` }}
      />
      <span className={`flex min-w-0 flex-col ${column ? "items-center" : "text-left"}`}>
        <span className="flex min-w-0 max-w-full items-center gap-1.5">
          <span className={`truncate leading-tight ${lettered ? "" : "font-bold"}`} style={lettered ? { ...display(nameSize), color: colors.INK, paddingRight: nameSize / 10 } : { fontSize: nameSize, color: colors.INK }}>
            {person.name}
          </span>
          {person.isYou && (
            <span className="shrink-0 border-[1.5px] px-1 pt-px leading-none" style={{ ...display(11), borderColor: colors.LINE, background: colors.YELLOW, color: colors.ON_YELLOW }}>
              You
            </span>
          )}
        </span>
        {detail && (
          <span className="truncate text-[12px] leading-tight" style={{ color: colors.INK_SUBTLE }}>
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * One drop as a comic panel's contents: its screenshot (or the item's icon on a halftone square) at a slight tilt, the item
 * lettered big, its Drop value on a price tag (or, with `burst`, in a starburst beside it), its Luck, and who got it
 * when. Every field of core's drop card is here.
 */
export function ComicDrop({ drop, showPlayer = false, burst = false }: { drop: WrappedDropModel; showPlayer?: boolean; burst?: boolean }) {
  const { colors } = useComic();
  const media = drop.thumbnailUrl && drop.screenshotUrl;
  const frame: CSSProperties = { border: `3px solid ${colors.LINE}`, boxShadow: `3px 3px 0 ${colors.SHADOW}`, background: colors.PAPER_ALT };
  return (
    <div data-beat="rise" className="relative flex items-center gap-3 text-left">
      <div className="relative shrink-0">
        {media ? (
          <ScreenshotLink href={drop.screenshotUrl!} className="block">
            <img src={drop.thumbnailUrl!} alt={`Screenshot of ${drop.itemName}`} loading="lazy" className="block size-[78px] object-cover" style={{ ...frame, transform: "rotate(-2deg)" }} />
          </ScreenshotLink>
        ) : (
          <div aria-hidden className="flex size-[78px] items-center justify-center" style={{ ...frame, transform: "rotate(-2deg)", backgroundImage: `radial-gradient(${colors.RULE} 1.2px, transparent 1.8px)`, backgroundSize: "7px 7px" }}>
            <WikiIcon name={drop.itemName} className="size-10 [image-rendering:pixelated]" />
          </div>
        )}
      </div>
      <div className={`min-w-0 flex-1 ${burst && drop.gpLabel ? "pr-[84px]" : ""}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          {media && <WikiIcon name={drop.itemName} />}
          <span className="min-w-0 break-words" style={{ ...display(23), color: colors.INK, lineHeight: 1.05 }}>
            {drop.itemName}
          </span>
          {drop.quantityLabel && (
            <span className="num shrink-0" style={{ ...display(17), color: colors.INK_SUBTLE }}>
              {drop.quantityLabel}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {drop.gpLabel && !burst && (
            <span className="num border-2 px-1.5 pt-[3px] pb-px" style={{ ...display(15), background: colors.GREEN_TINT, borderColor: colors.LINE, color: colors.INK }}>
              <Gp label={drop.gpLabel} />
            </span>
          )}
          {/* In the text's order, but set at the panel's right edge, the text leaving room for it. */}
          {drop.gpLabel && burst && (
            <div className="absolute top-1/2 right-0 w-[78px] -translate-y-1/2">
              <InkBurst fill={colors.YELLOW} tilt={9} className="w-full">
                <span className="num" style={{ fontSize: burstFont(`${drop.gpLabel}_`, 22) }}>
                  <Gp label={drop.gpLabel} />
                </span>
              </InkBurst>
            </div>
          )}
          {drop.luck && (
            <TooltipSpan text={drop.luck.sentence} label={drop.luck.shortLabel} className="num text-[14px] font-bold" style={{ color: colors.INK_BODY, fontFamily: COMIC_FIGURES_FONT }}>
              {drop.luck.shortLabel}
            </TooltipSpan>
          )}
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FIGURES_FONT }}>
          {showPlayer && drop.player && <ComicPerson person={drop.player} size={20} nameSize={13} />}
          {showPlayer && drop.team && (
            <span className="inline-flex shrink-0 items-center gap-1">
              {drop.team.color && <span aria-hidden className="size-2 rounded-full border border-current" style={{ background: drop.team.color }} />}
              {drop.team.name}
            </span>
          )}
          <span className="shrink-0">{drop.whenLabel}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A section's opening splash: a printed ground with the category's Category images (and its credits) standing on it as
 * stickers, then a band with a kicker and the title lettered big. With no art uploaded the ground carries the kicker and the
 * title instead, so the splash still reads as a finished opening panel.
 */
export function Splash({ art, accent, kicker, kickerDot, title, titleBig = 46, minHeight = 200 }: { art: WrappedSectionArtModel; accent: string; kicker: string; kickerDot?: string | null; title: ReactNode; titleBig?: number; minHeight?: number }) {
  const { colors } = useComic();
  const hasArt = art.images.length > 0 || art.credits.length > 0;
  const text = typeof title === "string" ? title : "";
  const size = titleSize(text, titleBig);
  return (
    <div className="relative flex flex-1 flex-col" style={{ minHeight }}>
      <PanelGround accent={accent} />
      {hasArt && (
        <div
          className="relative flex flex-1 flex-col items-center justify-end px-3 pt-3 pb-2.5 [&_.font-osrs]:text-[16px] [&_img]:max-h-[132px]! [&>div]:mb-0 [&>ul]:mt-3 [&>ul]:mb-0"
          style={{ ["--color-on-surface-subtle" as string]: COVER.ON_LOUD }}
        >
          <WrappedCategoryArt art={art} />
        </div>
      )}
      <div className={hasArt ? "wrapped-panel-band relative px-3.5 pt-2 pb-2.5" : "relative flex flex-1 flex-col justify-between px-3.5 pt-3.5 pb-4"} style={hasArt ? { background: colors.PAPER_RAISED, borderTop: `3px solid ${colors.LINE}` } : undefined}>
        <Kicker fill={COVER.YELLOW} dot={kickerDot}>
          {kicker}
        </Kicker>
        <h2
          className={`text-balance ${hasArt ? "mt-2" : "my-auto py-3 text-center"}`}
          style={
            hasArt
              ? { ...display(size), color: colors.INK, paddingRight: size / 14 }
              : { ...display(size * 1.25), color: COVER.TITLE_FILL, WebkitTextStroke: `${Math.max(1.5, size / 22)}px ${COVER.INK}`, paintOrder: "stroke fill", textShadow: `${size / 11}px ${size / 11}px 0 ${COVER.INK}`, paddingRight: size / 10 }
          }
        >
          {title}
        </h2>
      </div>
    </div>
  );
}
