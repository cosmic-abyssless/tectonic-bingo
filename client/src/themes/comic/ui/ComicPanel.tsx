import type { NoticeProps } from "../../../core/ui/Card";
import type { CSSProperties } from "react";
import type { PanelProps } from "../../../core/ui/Panel";
import type { ComicColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { paperVars } from "../signup/parts";
import { CaptionBox } from "./CaptionBox";
import { useComic } from "./useComic";

/**
 * The comic theme's Panel slot: an ink-bordered panel on the palette's own paper (charcoal in the dark palettes, not
 * the book pages' papyrus: a page of it is a lot of light paper in a dark room), with a hard shadow and a Bangers
 * title. The chrome tokens inside point at that palette (paperVars) so core content in it matches, and its menus and
 * selects open inside it (data-portal-scope). Content that wants the papyrus inside it (the draft room's team cards)
 * draws with pageColors itself. Never tilted: a transform would pin sticky or fixed content inside it to the panel.
 */
export function ComicPanel({ title, header, children, padding = "md", className, style }: PanelProps) {
  const { colors } = useComic();
  return (
    <section
      data-portal-scope=""
      className={`comic-fields border-[3px] ${className ?? ""}`}
      style={{ ...paperVars(colors), ...gridVars(colors), background: colors.PAPER, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.LINE}`, color: colors.INK_BODY, ...style }}
    >
      {header}
      <div className={padding === "sm" ? "px-4 py-2.5" : "p-4"}>
        {title && (
          <h3 className="mb-3 text-xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
            {title}
          </h3>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * An AG Grid table on a comic panel (core/ui/agGrid.ts reads these): a raised header strip lettered in Bangers like the
 * masthead title (the title fill, outlined and dropped in comic.css) over a thick ink rule, quiet rules between the rows, alternate rows a shade raised, the panel's line colour round the
 * outside, square corners. The cell buttons and the header's casing are in comic.css.
 */
function gridVars(c: ComicColors): CSSProperties {
  return {
    "--comic-font": COMIC_FONT,
    "--grid-bg": c.PAPER,
    // The raised fill lifted a little further toward the lettering: a lighter charcoal on the dark palettes.
    "--grid-header-bg": `color-mix(in srgb, ${c.PAPER_RAISED} 86%, ${c.INK})`,
    "--grid-header-fg": c.TITLE_FILL,
    "--grid-header-font": COMIC_FONT,
    "--grid-header-weight": "400",
    "--grid-header-font-size": "1rem",
    "--grid-header-rule": `3px solid ${c.LINE}`,
    "--grid-row-rule": `1px solid ${c.RULE}`,
    "--grid-odd-row": `color-mix(in srgb, ${c.PAPER_RAISED} 55%, transparent)`,
    "--grid-row-hover": c.PAPER_RAISED,
    "--grid-wrapper-border": `3px solid ${c.LINE}`,
    "--grid-radius": "0px",
  } as CSSProperties;
}

const FILL = { neutral: "paper", info: "blue", ok: "green", warn: "yellow", danger: "red" } as const;

/** The comic theme's Notice slot: a tinted caption box in the tone, its icon in the tone's own ink. */
export function ComicNotice({ tone = "neutral", icon, children, className }: NoticeProps) {
  const { colors } = useComic();
  const ink = { neutral: colors.INK_SUBTLE, info: colors.INFO, ok: colors.OK, warn: colors.WARN, danger: colors.BAD }[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={className}>
      <CaptionBox tone={FILL[tone]}>
        <div className="flex items-start gap-2.5 text-sm">
          {icon && (
            <span className="mt-0.5 shrink-0" style={{ color: ink }}>
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1" style={{ ["--color-on-surface" as string]: colors.INK }}>
            {children}
          </div>
        </div>
      </CaptionBox>
    </div>
  );
}
