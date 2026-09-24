import type { NoticeProps } from "../../../core/ui/Card";
import type { PanelProps } from "../../../core/ui/Panel";
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
export function ComicPanel({ title, children, padding = "md", className, style }: PanelProps) {
  const { colors } = useComic();
  return (
    <section
      data-portal-scope=""
      className={`comic-fields border-[3px] ${padding === "sm" ? "px-4 py-2.5" : "p-4"} ${className ?? ""}`}
      style={{ ...paperVars(colors), background: colors.PAPER, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.LINE}`, color: colors.INK_BODY, ...style }}
    >
      {title && (
        <h3 className="mb-3 text-xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
          {title}
        </h3>
      )}
      {children}
    </section>
  );
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
