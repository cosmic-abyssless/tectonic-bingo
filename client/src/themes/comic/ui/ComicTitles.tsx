import type { CSSProperties } from "react";
import type { TitleGroup } from "@bingo/shared";
import type { TitleChipProps, TitleGroupBoxProps } from "../../../core/stats/TitleChrome";
import { TITLE_GROUP_STYLE } from "../../../core/stats/titles";
import { COMIC_FONT } from "../font";
import { toneColors, ToneBox, type Tone } from "./tones";
import { useComic } from "./useComic";
import { TooltipSpan } from "../../../core/ui/Tooltip";
import { LETTERED } from "../../lettering";

const GROUP_TONE: Record<TitleGroup, Tone> = { points: "blue", luck: "green", grind: "orange", mishaps: "red" };

/**
 * One Title group as a ToneBox in its group's tone, the group's name on the loud tag over its top edge. The Titles
 * inside letter in ink, like the rest of the book.
 */
export function ComicTitleGroupBox({ group, children }: TitleGroupBoxProps) {
  const { colors } = useComic();
  return (
    <ToneBox
      tone={GROUP_TONE[group]}
      label={TITLE_GROUP_STYLE[group].label}
      style={{ "--title-ink": colors.INK, "--title-rule": colors.RULE, "--title-name-size": "1.125rem" } as CSSProperties}
    >
      {children}
    </ToneBox>
  );
}

/** A Title as an inked tag on its group's tint. */
export function ComicTitleChip({ title }: TitleChipProps) {
  const { colors } = useComic();
  return (
    <TooltipSpan
      text={title.flavour}
      label={title.name}
      className={`${LETTERED} inline-flex shrink-0 items-center border-2 px-1.5 py-px text-sm uppercase leading-none`}
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", borderColor: colors.LINE, background: toneColors(colors, GROUP_TONE[title.group]).tint, color: colors.INK }}
    >
      {title.name}
    </TooltipSpan>
  );
}
