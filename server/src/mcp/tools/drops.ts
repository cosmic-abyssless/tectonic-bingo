import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as z from "zod";
import { NOT_RECORDED_HISTORICAL, playerName } from "@bingo/shared";
import * as schema from "../../db/schema";
import { bingos, claims, nodes, signups, submissions, teamMembers, tiles, users } from "../../db/schema";
import { getFullGraph } from "../../services/graphService";
import { recordedFor } from "../../services/historicalService";
import { dropsOnly } from "../../services/submissionKinds";
import { defineTool } from "../tool";
import { bingoBySlug, bingoSpan, fitList, hoursFrom, slugInput, teamNames } from "./common";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Each user's name in this Bingo (their Signup RSN, else their Discord name, as the site names them) and whether that
 * Signup is a Borrowed account.
 */
function namesIn(db: Db, bingoId: string, userIds: string[]): Map<string, { name: string; borrowed: boolean }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const signed = new Map(
    db
      .select({ userId: signups.userId, rsn: signups.rsn, borrowed: signups.accountBorrowed })
      .from(signups)
      .where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, ids)))
      .all()
      .map((s) => [s.userId, s]),
  );
  const userRows = db
    .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
    .from(users)
    .where(inArray(users.id, ids))
    .all();
  return new Map(userRows.map((u) => [u.id, { name: playerName({ ...u, rsn: signed.get(u.id)?.rsn }), borrowed: signed.get(u.id)?.borrowed ?? false }]));
}

/**
 * The Tile and Task each node counts towards: a Task is a Tile's direct Part, and everything under it is its Parts.
 * A Part shared by several Tasks is put under the first one in board order, as the Stats page labels it.
 */
function tileAndTaskOf(db: Db, bingoId: string): Map<string, { tile: string; task: string; taskId: string }> {
  const { childrenOf } = getFullGraph(db, bingoId);
  const labelOf = new Map(
    db
      .select({ id: nodes.id, label: nodes.label, itemName: nodes.itemName })
      .from(nodes)
      .where(eq(nodes.bingoId, bingoId))
      .all()
      .map((n) => [n.id, n.label ?? n.itemName]),
  );
  const out = new Map<string, { tile: string; task: string; taskId: string }>();
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  for (const t of tileRows.sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol)) {
    for (const taskId of childrenOf.get(t.nodeId) ?? []) {
      const at = { tile: t.name, task: labelOf.get(taskId) ?? "Untitled part", taskId };
      const walk = (id: string) => {
        if (out.has(id)) return;
        out.set(id, at);
        for (const child of childrenOf.get(id) ?? []) walk(child);
      };
      walk(taskId);
    }
  }
  return out;
}

const GROUPS = {
  item: ["bingo", "item"],
  team_item: ["bingo", "team", "item"],
  player: ["bingo", "player", "team"],
  tile: ["bingo", "tile"],
} as const;

export const drops = defineTool({
  name: "drops",
  title: "Drops",
  description:
    "The drops Players claimed in one or more Bingos (pass several slugs to compare Bingos): each Claim of an item on a drop Submission " +
    "(Proof screenshots are left out, having no Claims). " +
    "As a list (groupBy none), one row per Claim in the order posted: bingo (slug), item, quantity, dropValue (the Drop value in gp as the Stats page counts it: " +
    "the item's price when it was submitted, times quantity; null when it has no price), tile and task it was claimed for, part (the item's Part under that Task, null when the Task is the item itself), " +
    "team, player (the RSN of the Player credited with the drop; borrowedAccount true when that RSN is a Borrowed account, played on someone else's account), " +
    "postedBy (only when someone else posted it for them: their name and whether a teammate or a Moderator), " +
    "submittedAtHours (hours from that Bingo's start), status (approved, rejected or pending) and, for a rejected one, reviewerNotes (why it was rejected). " +
    "Grouped (groupBy item, team_item, player or tile), one row per group, highest total Drop value first: the group's keys (always with the bingo), " +
    "claims (how many Claims), totalQuantity, and totalDropValue (gp, Claims with no price count as 0). " +
    "Only approved Claims by default, as the Stats page counts them; pass status to see rejected or pending ones.",
  input: z.object({
    slugs: z.array(slugInput).min(1).max(5).describe("The Bingos' slugs, from list_bingos: one, or up to 5 to compare."),
    team: z.string().optional().describe("Only Claims by the Team with this name (any case)."),
    player: z.string().optional().describe("Only Claims credited to a Player whose RSN contains this text (any case)."),
    item: z.string().optional().describe("Only Claims of an item whose name contains this text (any case)."),
    tile: z.string().optional().describe("Only Claims for a Tile whose name contains this text (any case)."),
    status: z
      .enum(["approved", "rejected", "pending", "any"])
      .optional()
      .describe("Which Submissions' Claims: approved (the default), rejected, pending, or any."),
    groupBy: z
      .enum(["none", "item", "team_item", "player", "tile"])
      .optional()
      .describe("none (the default) lists each Claim; the others total Claims per item, per Team and item, per Player, or per Tile."),
    limit: z.number().int().positive().optional().describe("At most this many rows."),
  }),
  bingoIdFor: ({ slugs }, { db }) =>
    slugs.length === 1 ? (db.select({ id: bingos.id }).from(bingos).where(eq(bingos.slug, slugs[0]!)).get()?.id ?? null) : null,
  run: ({ slugs, team, player, item, tile, status = "approved", groupBy = "none", limit }, { db, scope }) => {
    const contains = (text: string | null | undefined, part: string | undefined) => !part || (text ?? "").toLowerCase().includes(part.toLowerCase());
    const bingoList = [...new Set(slugs)].map((slug) => bingoBySlug(db, slug, scope));
    const notRecorded: string[] = [];

    const rows = bingoList.flatMap((bingo) => {
      // A Historical Bingo imported without its Submissions has no drops to show, which isn't the same as none.
      if (recordedFor(db, bingo)?.submissions === false) notRecorded.push(bingo.slug);
      const { start } = bingoSpan(db, bingo);
      const names = teamNames(db, bingo.id);
      const teamIds = [...names.keys()];
      if (teamIds.length === 0) return [];
      const claimRows = db
        .select({
          nodeId: claims.nodeId,
          itemName: claims.itemName,
          quantity: claims.quantity,
          gpValue: claims.gpValue,
          teamId: submissions.teamId,
          userId: submissions.submittedByUserId,
          postedByUserId: submissions.postedByUserId,
          submittedAt: submissions.submittedAt,
          status: submissions.status,
          reviewerNotes: submissions.reviewerNotes,
          nodeLabel: nodes.label,
        })
        .from(claims)
        .innerJoin(submissions, eq(claims.submissionId, submissions.id))
        .innerJoin(nodes, eq(claims.nodeId, nodes.id))
        .where(and(inArray(submissions.teamId, teamIds), eq(nodes.bingoId, bingo.id), dropsOnly, ...(status === "any" ? [] : [eq(submissions.status, status)])))
        .all()
        .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
      const people = namesIn(
        db,
        bingo.id,
        claimRows.flatMap((r) => (r.postedByUserId ? [r.userId, r.postedByUserId] : [r.userId])),
      );
      // Who posted for a Player: a teammate when they're on that Team, otherwise a Moderator (CONTEXT.md "Submission").
      const memberOf = new Set(
        db
          .select({ teamId: teamMembers.teamId, userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, teamIds))
          .all()
          .map((m) => `${m.teamId}:${m.userId}`),
      );
      const placed = tileAndTaskOf(db, bingo.id);

      return claimRows.map((r) => {
        const where = placed.get(r.nodeId);
        const credited = people.get(r.userId);
        const itemName = r.itemName ?? r.nodeLabel ?? "Untitled part";
        return {
          bingo: bingo.slug,
          item: itemName,
          quantity: r.quantity,
          dropValue: r.gpValue,
          tile: where?.tile ?? null,
          task: where?.task ?? null,
          part: where && r.nodeId !== where.taskId ? (r.nodeLabel ?? itemName) : null,
          team: names.get(r.teamId) ?? null,
          player: credited?.name ?? null,
          ...(credited?.borrowed ? { borrowedAccount: true } : {}),
          ...(r.postedByUserId
            ? { postedBy: { name: people.get(r.postedByUserId)?.name ?? null, as: memberOf.has(`${r.teamId}:${r.postedByUserId}`) ? "teammate" : "moderator" } }
            : {}),
          submittedAtHours: hoursFrom(start, r.submittedAt),
          status: r.status,
          ...(r.status === "rejected" && r.reviewerNotes?.trim() ? { reviewerNotes: r.reviewerNotes.trim() } : {}),
        };
      });
    });

    const matching = rows.filter(
      (r) =>
        (!team || r.team?.toLowerCase() === team.toLowerCase()) && contains(r.player, player) && contains(r.item, item) && (!tile || contains(r.tile, tile)),
    );

    let out: object[] = matching;
    if (groupBy !== "none") {
      const keys = GROUPS[groupBy];
      const groups = new Map<string, Record<string, unknown> & { claims: number; totalQuantity: number; totalDropValue: number }>();
      for (const r of matching) {
        const key = keys.map((k) => r[k] ?? "").join("\u0000");
        const g = groups.get(key) ?? { ...Object.fromEntries(keys.map((k) => [k, r[k]])), claims: 0, totalQuantity: 0, totalDropValue: 0 };
        g.claims++;
        g.totalQuantity += r.quantity;
        g.totalDropValue += r.dropValue ?? 0;
        groups.set(key, g);
      }
      out = [...groups.values()].sort((a, b) => b.totalDropValue - a.totalDropValue || b.claims - a.claims);
    }

    const { items, truncated } = fitList(out, limit, "Narrow it with team, player, item or tile, group it with groupBy, or pass a smaller `limit`.");
    return {
      bingos: bingoList.map((b) => ({ slug: b.slug, name: b.name, stage: b.stage })),
      ...(notRecorded.length
        ? { notRecorded: `${NOT_RECORDED_HISTORICAL}: Submissions of ${notRecorded.join(", ")} (Historical) were never recorded, so they have no drops here.` }
        : {}),
      [groupBy === "none" ? "claims" : "groups"]: items,
      ...(truncated ? { truncated } : {}),
    };
  },
});
