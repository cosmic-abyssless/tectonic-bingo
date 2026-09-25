import type { CSSProperties } from "react";
import type { TitleGroup } from "@bingo/shared";
import type { TitleChipProps, TitleGroupBoxProps } from "../../../core/stats/TitleChrome";
import { TITLE_GROUP_STYLE } from "../../../core/stats/titles";
import type { ComicColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

/** Each Title group's tint (its box and chips) and loud colour (the box's label). */
function groupColors(colors: ComicColors): Record<TitleGroup, { tint: string; loud: string }> {
  return {
    points: { tint: colors.BLUE_TINT, loud: colors.BLUE },
    luck: { tint: colors.GREEN_TINT, loud: colors.GREEN },
    grind: { tint: colors.YELLOW_TINT, loud: colors.ORANGE },
    mishaps: { tint: colors.RED_TINT, loud: colors.RED },
  };
}

/**
 * One Title group as a caption box on its tint, heavy ink border and drop shadow, with the group's name on a loud tag
 * knocked askew over its top edge. The Titles inside letter in ink, like the rest of the book.
 */
export function ComicTitleGroupBox({ group, children }: TitleGroupBoxProps) {
  const { colors } = useComic();
  const { tint, loud } = groupColors(colors)[group];
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
      {children}
    </section>
  );
}

/** A Title as an inked tag on its group's tint. */
export function ComicTitleChip({ title }: TitleChipProps) {
  const { colors } = useComic();
  return (
    <span
      title={title.flavour}
      className="inline-flex shrink-0 items-center border-2 px-1.5 py-px text-sm uppercase leading-none"
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", borderColor: colors.LINE, background: groupColors(colors)[title.group].tint, color: colors.INK }}
    >
      {title.name}
    </span>
  );
}
