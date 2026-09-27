import type { CSSProperties, ReactNode } from "react";
import type { TitleDefinition, TitleGroup } from "@bingo/shared";
import { useOptionalSlot } from "../../themes/context";
import { TITLE_GROUP_STYLE } from "./titles";

export interface TitleGroupBoxProps {
  group: TitleGroup;
  children: ReactNode;
}

export interface TitleChipProps {
  title: TitleDefinition;
}

/**
 * The box one Title group's rows sit in on the stats page, labelled with the group. It sets `--title-ink` (the Title
 * names) and `--title-rule` (the lines between rows) for the rows inside, and may set `--title-name-size` (a narrow
 * heading font wants the names bigger). Inside a theme that draws its own (the TitleGroupBox slot) it's the theme's.
 */
export function TitleGroupBox(props: TitleGroupBoxProps) {
  const Themed = useOptionalSlot("TitleGroupBox");
  return Themed ? <Themed {...props} /> : <PlainTitleGroupBox {...props} />;
}

/** One Title as a small badge, in its group's colour: the contributors table and the player's profile. */
export function TitleChip(props: TitleChipProps) {
  const Themed = useOptionalSlot("TitleChip");
  return Themed ? <Themed {...props} /> : <PlainTitleChip {...props} />;
}

export function PlainTitleGroupBox({ group, children }: TitleGroupBoxProps) {
  const style = TITLE_GROUP_STYLE[group];
  return (
    <section className={`rounded-lg border px-3 pt-2 ${style.box}`} style={{ "--title-ink": style.ink, "--title-rule": `color-mix(in srgb, ${style.ink} 15%, transparent)` } as CSSProperties}>
      <h3 className={`text-[11px] font-semibold tracking-wide uppercase ${style.text}`}>{style.label}</h3>
      {children}
    </section>
  );
}

export function PlainTitleChip({ title }: TitleChipProps) {
  return (
    <span title={title.flavour} className={`shrink-0 rounded-sm border px-1 text-[10px] leading-4 font-semibold ${TITLE_GROUP_STYLE[title.group].chip}`}>
      {title.name}
    </span>
  );
}
