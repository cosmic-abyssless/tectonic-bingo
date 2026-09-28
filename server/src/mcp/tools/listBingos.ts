import { desc, eq, sql } from "drizzle-orm";
import * as z from "zod";
import { bingos, signups, teamMembers, teams } from "../../db/schema";
import { defineTool } from "../tool";

// From Board revealed on, the Players are whoever is on a Team; before that, the active signups (CONTEXT.md "Player").
const PLAYERS_ARE_TEAM_MEMBERS = new Set(["reveal", "live", "complete"]);

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const listBingos = defineTool({
  name: "list_bingos",
  title: "List Bingos",
  description:
    "Every Bingo, newest first: slug (use it to ask about one Bingo), name, stage (planning, signup, captains, draft, reveal, live, complete; complete is Finished), its scheduled dates, and how many Teams and Players it has. Players are the active signups until the Board is revealed, then the members of Teams.",
  input: z.object({}),
  run: (_args, { db }) => {
    const teamCounts = db
      .select({ bingoId: teams.bingoId, teams: sql<number>`count(distinct ${teams.id})`, members: sql<number>`count(${teamMembers.id})` })
      .from(teams)
      .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .groupBy(teams.bingoId)
      .all();
    const signupCounts = db
      .select({ bingoId: signups.bingoId, count: sql<number>`count(*)` })
      .from(signups)
      .where(eq(signups.status, "active"))
      .groupBy(signups.bingoId)
      .all();
    const teamsBy = new Map(teamCounts.map((r) => [r.bingoId, r]));
    const signupsBy = new Map(signupCounts.map((r) => [r.bingoId, r.count]));

    const rows = db.select().from(bingos).orderBy(desc(bingos.createdAt)).all();
    return {
      bingos: rows.map((b) => ({
        slug: b.slug,
        name: b.name,
        stage: b.stage,
        dates: {
          createdAt: iso(b.createdAt),
          signupOpensAt: iso(b.signupOpensAt),
          draftScheduledAt: iso(b.draftScheduledAt),
          revealScheduledAt: iso(b.revealScheduledAt),
          startsAt: iso(b.startsAt),
          endsAt: iso(b.endsAt),
        },
        teams: teamsBy.get(b.id)?.teams ?? 0,
        players: PLAYERS_ARE_TEAM_MEMBERS.has(b.stage) ? (teamsBy.get(b.id)?.members ?? 0) : (signupsBy.get(b.id) ?? 0),
      })),
    };
  },
});
