import { pickTitles, type PickedTitle, type PlayerTitleFacts, type StatsResponse, type TitleContext, type TitleGroup } from "@bingo/shared";

/** The moments Titles are judged at (On Fire's window), from the stats response and the viewer's clock. */
export function titleContextOf(stats: Pick<StatsResponse, "titleContext">, now = new Date()): TitleContext {
  const { liveAt, endedAt } = stats.titleContext;
  return { now, liveAt: liveAt ? new Date(liveAt) : null, endedAt: endedAt ? new Date(endedAt) : null };
}

/** Every Title's holders among the Players in `pool` (the ones the team filter shows). */
export function pickStatsTitles(stats: Pick<StatsResponse, "titleContext" | "titleSettings">, pool: PlayerTitleFacts[]): PickedTitle[] {
  return pickTitles(pool, titleContextOf(stats), stats.titleSettings);
}

/**
 * Each Title group's name and colour, from the theme's status colours so it follows light and dark: the group's box on
 * the stats page (TitleChrome), and the Title chips. `ink` is the colour itself, for the rows' Title names. Full class
 * names, for Tailwind.
 */
export const TITLE_GROUP_STYLE: Record<TitleGroup, { label: string; ink: string; box: string; text: string; chip: string }> = {
  points: { label: "Points", ink: "var(--color-info)", box: "border-info/30 bg-info/5", text: "text-info", chip: "border-info/40 text-info" },
  luck: { label: "Luck", ink: "var(--color-ok)", box: "border-ok/30 bg-ok/5", text: "text-ok", chip: "border-ok/40 text-ok" },
  grind: { label: "Grind", ink: "var(--color-warn)", box: "border-warn/30 bg-warn/5", text: "text-warn", chip: "border-warn/40 text-warn" },
  mishaps: { label: "Mishaps", ink: "var(--color-danger)", box: "border-danger/30 bg-danger/5", text: "text-danger", chip: "border-danger/40 text-danger" },
};
