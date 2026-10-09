import type { CSSProperties, ReactNode } from "react";
import type { WrappedDropModel, WrappedPersonModel } from "../../../../headless/types";
import { ScreenshotLink } from "../../../../core/submissions/ScreenshotThumb";
import { WikiIcon } from "../../../../core/ui/ItemIcon";
import { TooltipSpan } from "../../../../core/ui/Tooltip";
import { COMIC_FIGURES_FONT, COMIC_FONT } from "../../font";
import { burstPoints } from "../../ui/Burst";
import { onFill, PrintedShade, toneColors, type Tone, type ToneOrColor } from "../../ui/tones";
import { useComic } from "../../ui/useComic";

// The pieces of the comic Wrapped's You, Duo, Captain and Moderator pages (#420). A page is a WrappedScene laid out at the
// book's fixed 420px width (no viewport breakpoints), and each panel is one Reveal. Everything is drawn from the page's
// own palette (useComic: the paper palette inside the book), so the sections read the same in the light and dark scheme.

/**
 * The classes a Reveal gets when its panel should fill the height its row gives it (a grid row's, or the page's spare
 * room): the panel and the brush layer inside it stretch, and the content root is `PanelBody`, which grows into them.
 */
export const FILL = "flex flex-col p-4 [&>.wrapped-panel-content]:flex [&>.wrapped-panel-content]:flex-1 [&>.wrapped-panel-content]:flex-col";

/**
 * A panel's inside: an optional printed colour (with rays, from a point) behind the content, which is centred in what's
 * left. The colour is printed strong, half the tone's loud ink on the paper, with its halftone over it, as a comic's flat
 * colour is, but light enough under the ink lettering to read.
 */
export function PanelBody({ tone, rays, align = "center", gap = 8, className = "", children }: { tone?: ToneOrColor; rays?: string; align?: "center" | "start"; gap?: number; className?: string; children: ReactNode }) {
  const { colors } = useComic();
  const toned = tone ? toneColors(colors, tone) : null;
  return (
    <>
      {toned && (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: `color-mix(in srgb, ${toned.loud} 52%, ${colors.PAPER_RAISED})`, backgroundImage: rays ? `repeating-conic-gradient(from 0deg at ${rays}, ${colors.RAY} 0deg 5deg, transparent 5deg 13deg)` : undefined }}
          />
          <PrintedShade ink={toned.loud} strength={55} from={20} />
        </>
      )}
      <div className={`relative flex min-w-0 flex-1 flex-col ${align === "center" ? "justify-center" : ""} ${className}`} style={{ gap, color: colors.INK_BODY }}>
        {children}
      </div>
    </>
  );
}

/** A small label on a loud tag, knocked askew, like a comic's "Meanwhile..." box. */
export function Kicker({ children, tone = "yellow", tilt = -2, className = "" }: { children: ReactNode; tone?: Tone; tilt?: number; className?: string }) {
  const { colors } = useComic();
  const { loud, onLoud } = toneColors(colors, tone);
  return (
    <p data-beat="rise"
      className={`inline-block self-start border-2 px-2 pt-[3px] pb-px uppercase leading-none ${className}`}
      style={{ fontFamily: COMIC_FONT, fontSize: 16, letterSpacing: "0.06em", background: loud, color: onLoud, borderColor: colors.LINE, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {children}
    </p>
  );
}

/** Display lettering: the title fill, outlined and dropped in the palette's stroke, like the page title. */
export function InkTitle({ children, size = 48, tilt = 0, align = "left", as: Tag = "h2", className = "" }: { children: ReactNode; size?: number; tilt?: number; align?: "left" | "center"; as?: "h2" | "h3" | "p"; className?: string }) {
  return (
    <Tag data-beat="slam"
      className={`comic-outline-text uppercase ${className}`}
      style={{
        fontFamily: COMIC_FONT,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 0.98,
        letterSpacing: "0.02em",
        textAlign: align,
        overflowWrap: "anywhere",
        // Room for Bangers' lean and the hard drop, which would be clipped at the box's edge.
        paddingRight: size / 10,
        paddingBottom: size / 14,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
      }}
    >
      {children}
    </Tag>
  );
}

/** Plain Bangers lettering in ink (a name, a figure), no outline. */
export function Lettering({ children, size = 22, color, className = "", style }: { children: ReactNode; size?: number; color?: string; className?: string; style?: CSSProperties }) {
  const { colors } = useComic();
  return (
    <span className={`uppercase leading-none ${className}`} style={{ fontFamily: COMIC_FONT, fontSize: size, letterSpacing: "0.03em", color: color ?? colors.INK, ...style }}>
      {children}
    </span>
  );
}

/** A sound effect, drawn into the corner of a panel: loud lettering inked round, tipped. Decorative, so hidden from readers. */
export function Sfx({ children, size = 34, tilt = -8, fill, className = "", style }: { children: ReactNode; size?: number; tilt?: number; fill?: string; className?: string; style?: CSSProperties }) {
  const { colors } = useComic();
  return (
    <span data-beat="pop"
      aria-hidden
      className={`pointer-events-none select-none whitespace-nowrap uppercase leading-none ${className}`}
      style={{
        fontFamily: COMIC_FONT,
        fontSize: size,
        letterSpacing: "0.04em",
        color: fill ?? colors.RED,
        WebkitTextStroke: `${Math.max(2, size / 9)}px ${colors.LINE}`,
        paintOrder: "stroke fill",
        textShadow: `${size / 11}px ${size / 11}px 0 ${colors.SHADOW}`,
        transform: `rotate(${tilt}deg)`,
        paddingRight: size / 10,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A number in a starburst, its label under it. The lettering is sized to its length so a long figure still sits inside
 * the points; the burst is `size` px across.
 */
export function StatBurst({ value, label, size = 150, fill, tilt = -6, spikes = 15, coins = false, className = "" }: { value: string; label?: ReactNode; size?: number; fill?: string; tilt?: number; spikes?: number; coins?: boolean; className?: string }) {
  const { colors } = useComic();
  const paint = fill ?? colors.YELLOW;
  const points = burstPoints(spikes, 36, 50, 5);
  // The Coins icon takes about a character's room.
  const font = Math.min(size * 0.34, (size * 0.62) / (Math.max(3, value.length + (coins ? 1 : 0)) * 0.46));
  return (
    <div data-beat="slam" className={`flex shrink-0 flex-col items-center ${className}`}>
      <div className="relative" style={{ width: size, height: size, transform: `rotate(${tilt}deg)` }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <polygon points={points} fill={colors.SHADOW} transform="translate(3 3.5)" />
          <polygon points={points} fill={paint} stroke={colors.LINE} strokeWidth={2.5} strokeLinejoin="round" />
        </svg>
        <div className="num absolute inset-0 flex items-center justify-center whitespace-nowrap uppercase leading-none" style={{ fontFamily: COMIC_FONT, fontSize: font, letterSpacing: "0.01em", color: onFill(colors, paint), paddingRight: font / 12 }}>
          {coins ? <Gp label={value} /> : value}
        </div>
      </div>
      {label && (
        <p className="mt-1.5 text-center uppercase leading-none" style={{ fontFamily: COMIC_FONT, fontSize: 17, letterSpacing: "0.05em", color: colors.INK }}>
          {label}
        </p>
      )}
    </div>
  );
}

/** A rubber stamp for a verdict: a double ring in a colour, pressed on at an angle. It wraps rather than running off its panel. */
export function InkStamp({ children, color, tilt = -8, size = 22, className = "" }: { children: ReactNode; color?: string; tilt?: number; size?: number; className?: string }) {
  const { colors } = useComic();
  const ink = color ?? colors.OK;
  return (
    <span data-beat="pop"
      className={`inline-block max-w-full select-none text-center uppercase leading-[1.05] ${className}`}
      style={{
        fontFamily: COMIC_FONT,
        fontSize: size,
        letterSpacing: "0.07em",
        color: ink,
        border: `3px solid ${ink}`,
        boxShadow: `0 0 0 2px ${colors.PAPER_RAISED}, 0 0 0 4px ${ink}`,
        background: colors.PAPER_RAISED,
        padding: "4px 10px",
        margin: 4,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      {children}
    </span>
  );
}

/** A Player's avatar and name, in comic lettering; the viewer gets a small tag. */
export function PersonChip({ person, size = 24, nameSize = 19, className = "" }: { person: WrappedPersonModel; size?: number; nameSize?: number; className?: string }) {
  const { colors } = useComic();
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}>
      <img src={person.avatarUrl} alt="" loading="lazy" className="shrink-0 rounded-full border-2" style={{ width: size, height: size, borderColor: colors.LINE, background: colors.PAPER_ALT }} />
      <Lettering size={nameSize} className="min-w-0 truncate" style={{ lineHeight: 1.25 }}>
        {person.name}
      </Lettering>
      {person.isYou && (
        <span className="shrink-0 border-2 px-1 uppercase leading-none" style={{ fontFamily: COMIC_FONT, fontSize: 12, borderColor: colors.LINE, background: colors.YELLOW, color: colors.ON_YELLOW }}>
          You
        </span>
      )}
    </span>
  );
}

/**
 * One drop, lettered straight onto its panel (a card in a panel would be a box in a box): the screenshot's thumbnail in an
 * inked frame (opening full size), or the item's icon in one; the item, its Drop value and Luck; who got it and when.
 * `showPlayer` for drops that aren't the viewer's.
 */
export function DropCard({ drop, showPlayer = false, showTeam = showPlayer, stacked = false, className = "" }: { drop: WrappedDropModel; showPlayer?: boolean; showTeam?: boolean; stacked?: boolean; className?: string }) {
  const { colors } = useComic();
  const frame = { borderColor: colors.LINE, background: colors.PAPER_ALT } as const;
  const thumb =
    drop.thumbnailUrl && drop.screenshotUrl ? (
      <ScreenshotLink href={drop.screenshotUrl} className="shrink-0">
        <img src={drop.thumbnailUrl} alt={`Screenshot of ${drop.itemName}`} loading="lazy" className={`border-[3px] object-cover ${stacked ? "h-14 w-full" : "size-10"}`} style={frame} />
      </ScreenshotLink>
    ) : (
      <div aria-hidden className={`flex shrink-0 items-center justify-center border-[3px] ${stacked ? "h-14 w-full" : "size-10"}`} style={frame}>
        <WikiIcon name={drop.itemName} className="size-8 [image-rendering:pixelated]" />
      </div>
    );
  return (
    <div data-beat="rise" className={`flex w-full min-w-0 gap-2 text-left ${stacked ? "flex-col" : "items-center"} ${className}`} style={{ color: colors.INK_BODY }}>
      {thumb}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {drop.thumbnailUrl && <WikiIcon name={drop.itemName} />}
          <Lettering size={18} className={`min-w-0 ${stacked ? "break-words" : "truncate"}`} style={{ lineHeight: 1.2 }}>
            {drop.itemName}
          </Lettering>
          {drop.quantityLabel && <span className="num shrink-0 text-[13px] font-semibold">{drop.quantityLabel}</span>}
        </div>
        {/* On a wide card the time rides on the figures' line, so the card stays two lines tall. */}
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 text-[13px] font-bold leading-tight" style={{ fontFamily: COMIC_FIGURES_FONT }}>
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            {drop.gpLabel && <Gp label={drop.gpLabel} className="num self-center" style={{ color: colors.INK }} />}
            {drop.luck && (
              <TooltipSpan text={drop.luck.sentence} label={drop.luck.shortLabel} className="num" style={{ color: colors.INK_SUBTLE }}>
                {drop.luck.shortLabel}
              </TooltipSpan>
            )}
          </span>
          {!stacked && !showPlayer && !showTeam && (
            <span className="shrink-0 text-[12px]" style={{ color: colors.INK_SUBTLE }}>
              {drop.whenLabel}
            </span>
          )}
        </div>
        {(stacked || showPlayer || showTeam) && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] font-bold leading-tight" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FIGURES_FONT }}>
            {showPlayer && drop.player && <PersonChip person={drop.player} size={16} nameSize={14} />}
            {showTeam && drop.team && (
              <span className="inline-flex shrink-0 items-center gap-1">
                {drop.team.color && <span className="size-2 rounded-full" style={{ backgroundColor: drop.team.color }} />}
                {drop.team.name}
              </span>
            )}
            <span className="shrink-0">{drop.whenLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** A GP figure with the OSRS Coins icon before it, the icon sized to the figure's lettering. */
export function Gp({ label, className = "", style }: { label: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={`inline-flex items-center gap-[0.15em] whitespace-nowrap ${className}`} style={style}>
      <WikiIcon name="Coins 10000" className="size-[0.95em]! [image-rendering:pixelated]" />
      {label}
    </span>
  );
}

/** Body copy in a panel. */
export function Body({ children, size = 15, className = "", style }: { children: ReactNode; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <p className={`leading-snug ${className}`} style={{ fontSize: size, ...style }}>
      {children}
    </p>
  );
}

/** How big a headline of this length is lettered in a 384px-wide panel: the longer, the smaller, so it keeps to a few lines. */
export function headlineSize(text: string, sizes: [number, number, number, number] = [58, 48, 40, 32]): number {
  const n = text.length;
  return n <= 9 ? sizes[0] : n <= 14 ? sizes[1] : n <= 20 ? sizes[2] : sizes[3];
}
