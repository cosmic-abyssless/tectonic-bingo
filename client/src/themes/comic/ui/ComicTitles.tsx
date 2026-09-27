import type { CSSProperties } from "react";
import type { TitleGroup } from "@bingo/shared";
import type { TitleChipProps, TitleGroupBoxProps } from "../../../core/stats/TitleChrome";
import { TITLE_GROUP_STYLE } from "../../../core/stats/titles";
import type { ComicColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

/**
 * Each Title group's tint (its box and chips) and loud colour (the box's label). The light palette's tints; in the dark
 * ones, whose tints are deep and saturated, a little of the loud colour on the raised paper instead.
 */
function groupColors(colors: ComicColors, scheme: "light" | "dark"): Record<TitleGroup, { tint: string; loud: string }> {
  const tint = (light: string, loud: string) => (scheme === "light" ? light : `color-mix(in srgb, ${loud} 20%, ${colors.PAPER_RAISED})`);
  return {
    points: { tint: tint(colors.BLUE_TINT, colors.BLUE), loud: colors.BLUE },
    luck: { tint: tint(colors.GREEN_TINT, colors.GREEN), loud: colors.GREEN },
    grind: { tint: tint(colors.YELLOW_TINT, colors.ORANGE), loud: colors.ORANGE },
    mishaps: { tint: tint(colors.RED_TINT, colors.RED), loud: colors.RED },
  };
}

/**
 * One Title group as a caption box on its tint, heavy ink border and drop shadow, with the group's name on a loud tag
 * knocked askew over its top edge, and a printed shading of the loud colour's dots fading in towards the right (as the
 * scouting banner has). The Titles inside letter in ink, like the rest of the book.
 */
export function ComicTitleGroupBox({ group, children }: TitleGroupBoxProps) {
  const { colors, scheme } = useComic();
  const { tint, loud } = groupColors(colors, scheme)[group];
  return (
    <section
      className="relative border-[3px] px-3 pb-1 pt-4"
      style={
        {
          // Room above for the label tag, which sits over the top edge (a margin class loses to the list's space-y).
          marginTop: "1.75rem",
          background: tint,
          borderColor: colors.LINE,
          boxShadow: `4px 4px 0 ${colors.LINE}`,
          "--title-ink": colors.INK,
          "--title-rule": colors.RULE,
          "--title-name-size": "1.125rem",
          // The rows' own text colours, read on the tint rather than the page (as ComicNotice does).
          "--color-on-surface": colors.INK,
          "--color-on-surface-muted": colors.INK_BODY,
          "--color-on-surface-subtle": colors.INK_SUBTLE,
        } as CSSProperties
      }
    >
      <h3
        className="absolute -top-4 left-3 border-2 px-2 py-0.5 text-lg uppercase leading-none tracking-wide"
        style={{ fontFamily: COMIC_FONT, background: loud, borderColor: colors.LINE, color: colors.ON_LOUD, boxShadow: `2px 2px 0 ${colors.LINE}`, transform: "rotate(-2deg)" }}
      >
        {TITLE_GROUP_STYLE[group].label}
      </h3>
      {/* Printed shading: dots of the loud colour, faint, fading in towards the right (the mask only reads currentColor's alpha). */}
      <div
        aria-hidden
        className="comic-shade pointer-events-none absolute inset-0"
        style={
          {
            "--comic-shade-ink": `color-mix(in srgb, ${loud} 30%, transparent)`,
            maskImage: "linear-gradient(to right, transparent 35%, currentColor)",
            WebkitMaskImage: "linear-gradient(to right, transparent 35%, currentColor)",
          } as CSSProperties
        }
      />
      {/* Above the shading, which as a positioned layer would otherwise paint over the rows. */}
      <div className="relative">{children}</div>
    </section>
  );
}

/** A Title as an inked tag on its group's tint. */
export function ComicTitleChip({ title }: TitleChipProps) {
  const { colors, scheme } = useComic();
  return (
    <span
      title={title.flavour}
      className="inline-flex shrink-0 items-center border-2 px-1.5 py-px text-sm uppercase leading-none"
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", borderColor: colors.LINE, background: groupColors(colors, scheme)[title.group].tint, color: colors.INK }}
    >
      {title.name}
    </span>
  );
}
