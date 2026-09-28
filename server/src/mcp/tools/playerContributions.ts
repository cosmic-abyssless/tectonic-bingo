import * as z from "zod";
import { discordName } from "@bingo/shared";
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
    "(womGains is null with no Wise Old Man snapshot; asOf is the latest snapshot the gains run up to).",
  input: z.object({
    slug: slugInput,
    team: z.string().optional().describe("Only Players on the Team with this name (any case)."),
    limit: z.number().int().positive().optional().describe("At most this many Players."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, team, limit }, { db }) => {
    const bingo = bingoBySlug(db, slug);
    const { start, end } = bingoSpan(db, bingo);
    const names = teamNames(db, bingo.id);
    const timelines = start ? loadTimelines(db, bingo.id) : new Map<string, never>();

    const players = getContributionCounts(db, bingo.id)
      .filter((c) => !team || names.get(c.teamId)?.toLowerCase() === team.toLowerCase())
      .map((c) => {
        const timeline = timelines.get(c.userId);
        const wom = start && timeline ? gainsOf(timeline, start, end) : null;
        return {
          rsn: c.user.rsn ?? null,
          discordName: discordName(c.user),
          team: names.get(c.teamId) ?? null,
          pointsShare: round2(c.pointsShare),
          approvedSubmissions: c.approvedSubmissions,
          gpGained: c.gpGained,
          womGains: wom && { ehb: round2(wom.ehb), ehp: round2(wom.ehp), clues: wom.clues, asOf: wom.asOf },
        };
      });

    const { items, truncated } = fitList(players, limit, "Pass `team` to pick one Team, or a smaller `limit`.");
    return { bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage }, players: items, ...(truncated ? { truncated } : {}) };
  },
});
