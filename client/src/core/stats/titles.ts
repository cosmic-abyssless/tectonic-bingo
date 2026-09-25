import { pickTitles, type PickedTitle, type PlayerTitleFacts, type StatsResponse, type TitleContext } from "@bingo/shared";

/** The moments Titles are judged at (On Fire's window), from the stats response and the viewer's clock. */
export function titleContextOf(stats: Pick<StatsResponse, "titleContext">, now = new Date()): TitleContext {
  const { liveAt, endedAt } = stats.titleContext;
  return { now, liveAt: liveAt ? new Date(liveAt) : null, endedAt: endedAt ? new Date(endedAt) : null };
}

/** Every Title's holders among the Players in `pool` (the ones the team filter shows). */
export function pickStatsTitles(stats: Pick<StatsResponse, "titleContext" | "titleSettings">, pool: PlayerTitleFacts[]): PickedTitle[] {
  return pickTitles(pool, titleContextOf(stats), stats.titleSettings);
}
