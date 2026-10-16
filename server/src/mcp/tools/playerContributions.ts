import * as z from "zod";
import { eq } from "drizzle-orm";
import { discordName } from "@bingo/shared";
import { tiles } from "../../db/schema";
import { computeEffort } from "../../services/effortService";
import { getContributionCounts } from "../../services/statsService";
import { gainsOf, loadTimelines } from "../../services/womReadService";
import { defineTool } from "../tool";
import { bingoBySlug, bingoIdForSlug, bingoSpan, fitList, round2, slugInput, teamNames } from "./common";

export const playerContributions = defineTool({
  name: "player_contributions",
  title: "Player contributions",
  description:
    "Every Player on a Team in one Bingo, highest Points share first: RSN, Discord name, Team, Points share (their part of the points their Team was awarded, Point adjustments left out), " +
    "approved Submissions, Total drop value (gpGained), and Wise Old Man gains (EHB, EHP, clues completed) from the Bingo's start to its end, measured as the Titles measure them " +
    "(womGains is null with no Wise Old Man snapshot; asOf is the latest snapshot the gains run up to). " +
    "effort is the Player's Effort: the hours (Wise Old Man EHB) they spent at the bosses of their Team's Parts while those Parts were still incomplete for the Team, " +
    "whether or not they got anything, with share (their percent of their Team's Effort), uncompletedHours (on Parts the Team never completed) and topTiles (their Tiles with the most hours). " +
    "Effort is recognition only, never points. It is null when not recorded for the Player (fewer than two Wise Old Man snapshots with per-boss EHB) or for the Bingo.",
  input: z.object({
    slug: slugInput,
    team: z.string().optional().describe("Only Players on the Team with this name (any case)."),
    limit: z.number().int().positive().optional().describe("At most this many Players."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, team, limit }, { db, scope }) => {
    const bingo = bingoBySlug(db, slug, scope);
    const { start, end } = bingoSpan(db, bingo);
    const names = teamNames(db, bingo.id);
    const timelines = start ? loadTimelines(db, bingo.id) : new Map<string, never>();
    const effort = computeEffort(db, bingo);
    const tileNames = new Map(db.select({ id: tiles.id, name: tiles.name }).from(tiles).where(eq(tiles.bingoId, bingo.id)).all().map((t) => [t.id, t.name]));

    const players = getContributionCounts(db, bingo.id)
      .filter((c) => !team || names.get(c.teamId)?.toLowerCase() === team.toLowerCase())
      .map((c) => {
        const timeline = timelines.get(c.userId);
        const wom = start && timeline ? gainsOf(timeline, start, end) : null;
        const e = effort?.players.get(c.userId);
        return {
          rsn: c.user.rsn ?? null,
          discordName: discordName(c.user),
          team: names.get(c.teamId) ?? null,
          pointsShare: round2(c.pointsShare),
          approvedSubmissions: c.approvedSubmissions,
          gpGained: c.gpGained,
          womGains: wom && { ehb: round2(wom.ehb), ehp: round2(wom.ehp), clues: wom.clues, asOf: wom.asOf },
          effort: e
            ? {
                hours: round2(e.hours),
                share: e.share === null ? null : round2(e.share),
                uncompletedHours: round2(e.uncompletedHours),
                topTiles: e.byTile.slice(0, 3).map((t) => ({ tile: tileNames.get(t.tileId) ?? "Unknown", hours: round2(t.hours) })),
                asOf: e.asOf,
              }
            : null,
        };
      });

    const { items, truncated } = fitList(players, limit, "Pass `team` to pick one Team, or a smaller `limit`.");
    return { bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage }, players: items, ...(truncated ? { truncated } : {}) };
  },
});
