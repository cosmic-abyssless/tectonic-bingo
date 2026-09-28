// Superlative (CONTEXT.md "Superlative"): a per-Bingo, admin-managed category voted by each Team on its own members
// (e.g. "Team MVP"). Categories aren't locked to any stage; voting is open for the whole of Live and secret
// throughout — the server keeps the voter only to enforce one pick per category and let it change.
import { and, eq, inArray } from "drizzle-orm";
import type { AvatarUser, SuperlativeTeamTurnout } from "@bingo/shared";
import { now as clockNow } from "../clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { superlativeCategories, superlativeVotes, teamMembers, users } from "../db/schema";
import { ServiceError } from "./errors";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { PUBLIC_USER_COLS } from "./userService";
import { withRsn } from "./playerNames";
import { getAcceptedPairs } from "./pairingService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

const MAX_CATEGORIES = 30;
const MAX_NAME_LENGTH = 60;

// ---------------------------------------------------------------------------
// Categories (admin-managed, any stage)
// ---------------------------------------------------------------------------

export function getCategories(db: Db, bingoId: string) {
  return db.select().from(superlativeCategories).where(eq(superlativeCategories.bingoId, bingoId)).orderBy(superlativeCategories.sortOrder).all();
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") throw new ServiceError(400, "name must be text");
  const trimmed = value.trim();
  if (!trimmed) throw new ServiceError(400, "name can't be blank");
  if (trimmed.length > MAX_NAME_LENGTH) throw new ServiceError(400, `name can be at most ${MAX_NAME_LENGTH} characters`);
  return trimmed;
}

export function createCategory(db: Db, params: { bingoId: string; name: string }) {
  const name = normalizeName(params.name);
  return db.transaction((tx) => {
    const existing = tx.select({ id: superlativeCategories.id }).from(superlativeCategories).where(eq(superlativeCategories.bingoId, params.bingoId)).all();
    if (existing.length >= MAX_CATEGORIES) throw new ServiceError(400, `At most ${MAX_CATEGORIES} superlative categories`);
    const category = tx.insert(superlativeCategories).values({ bingoId: params.bingoId, name, sortOrder: existing.length }).returning().get();
    audit(tx, {
      action: "superlative.category_created",
      bingoId: params.bingoId,
      entity: { type: "superlative_category", id: category.id, label: category.name },
      details: { name: category.name },
    });
    return category;
  });
}

// Renaming keeps every vote in the category — only the label changes.
export function renameCategory(db: Db, id: string, name: string) {
  const nextName = normalizeName(name);
  return db.transaction((tx) => {
    const existing = tx.select().from(superlativeCategories).where(eq(superlativeCategories.id, id)).get();
    if (!existing) throw new ServiceError(404, "Superlative category not found");
    const updated = tx.update(superlativeCategories).set({ name: nextName }).where(eq(superlativeCategories.id, id)).returning().get();
    const changes = diffFields(existing, updated, { only: ["name"] });
    if (changes) {
      audit(tx, {
        action: "superlative.category_updated",
        bingoId: existing.bingoId,
        entity: { type: "superlative_category", id, label: existing.name },
        details: { changes: changes as never },
      });
    } else {
      markAuditedNoop();
    }
    return updated;
  });
}

// Deleting a category drops every vote cast in it, across every Team.
export function deleteCategory(db: Db, id: string): void {
  db.transaction((tx) => {
    const existing = tx.select().from(superlativeCategories).where(eq(superlativeCategories.id, id)).get();
    if (!existing) {
      markAuditedNoop();
      return;
    }
    const votesDeleted = tx.delete(superlativeVotes).where(eq(superlativeVotes.categoryId, id)).run().changes;
    tx.delete(superlativeCategories).where(eq(superlativeCategories.id, id)).run();
    audit(tx, {
      action: "superlative.category_deleted",
      bingoId: existing.bingoId,
      entity: { type: "superlative_category", id, label: existing.name },
      details: { name: existing.name, votesDeleted },
    });
  });
}

export function reorderCategories(db: Db, bingoId: string, orderedIds: string[]): void {
  db.transaction((tx) => {
    for (const [index, id] of orderedIds.entries()) {
      tx.update(superlativeCategories).set({ sortOrder: index }).where(and(eq(superlativeCategories.id, id), eq(superlativeCategories.bingoId, bingoId))).run();
    }
    audit(tx, { action: "superlative.category_reordered", bingoId, entity: { type: "superlative_category", id: null }, details: { order: orderedIds } });
  });
}

// ---------------------------------------------------------------------------
// Voting (player-facing, own Team only)
// ---------------------------------------------------------------------------

function assertVotingOpen(bingo: Bingo): void {
  if (bingo.stage !== "live") throw new ServiceError(400, `Superlative voting is only open while the bingo is live (current stage: ${bingo.stage})`);
}

export interface SuperlativeBallot {
  votingOpen: boolean;
  categories: { id: string; name: string; sortOrder: number; myPick: string | null; votedCount: number; eligibleCount: number }[];
  teammates: (AvatarUser & { isCaptain: boolean; isCoCaptain: boolean; isMyDuoPartner: boolean })[];
}

/** The caller's own Team's ballot: every category, their pick (if any), and a participation count — never a tally. */
export function getBallot(db: Db, bingo: Bingo, teamId: string, voterUserId: string): SuperlativeBallot {
  const categories = getCategories(db, bingo.id);
  const memberRows = db
    .select({ isCaptain: teamMembers.isCaptain, isCoCaptain: teamMembers.isCoCaptain, user: PUBLIC_USER_COLS })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .all();
  const rsns = withRsn(db, bingo.id, memberRows.map((r) => r.user));
  const rsnById = new Map(rsns.map((u) => [u.id, u.rsn]));
  const myDuoPartnerId = getAcceptedPairs(db, bingo.id).find((p) => p.userIds.includes(voterUserId))?.userIds.find((id) => id !== voterUserId);
  const teammates = memberRows
    .filter((r) => r.user.id !== voterUserId)
    .map((r) => ({ ...r.user, rsn: rsnById.get(r.user.id) ?? null, isCaptain: r.isCaptain, isCoCaptain: r.isCoCaptain, isMyDuoPartner: r.user.id === myDuoPartnerId }));

  const eligibleCount = memberRows.length;
  const votes = categories.length
    ? db.select({ categoryId: superlativeVotes.categoryId, voterUserId: superlativeVotes.voterUserId, nomineeUserId: superlativeVotes.nomineeUserId }).from(superlativeVotes).where(and(eq(superlativeVotes.teamId, teamId), inArray(superlativeVotes.categoryId, categories.map((c) => c.id)))).all()
    : [];
  const votedCountOf = new Map<string, Set<string>>();
  const myPickOf = new Map<string, string>();
  for (const v of votes) {
    votedCountOf.set(v.categoryId, (votedCountOf.get(v.categoryId) ?? new Set()).add(v.voterUserId));
    if (v.voterUserId === voterUserId) myPickOf.set(v.categoryId, v.nomineeUserId);
  }

  return {
    votingOpen: bingo.stage === "live",
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      myPick: myPickOf.get(c.id) ?? null,
      votedCount: votedCountOf.get(c.id)?.size ?? 0,
      eligibleCount,
    })),
    teammates,
  };
}

/** Casts or changes the caller's pick for a category. Refused outside Live, for a self-vote, or a nominee not on the same Team. */
export function setVote(db: Db, bingo: Bingo, params: { categoryId: string; teamId: string; voterUserId: string; nomineeUserId: string }): void {
  assertVotingOpen(bingo);
  if (params.nomineeUserId === params.voterUserId) throw new ServiceError(400, "You can't vote for yourself");
  const category = db.select().from(superlativeCategories).where(eq(superlativeCategories.id, params.categoryId)).get();
  if (!category || category.bingoId !== bingo.id) throw new ServiceError(404, "Superlative category not found");
  const nominee = db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.teamId, params.teamId), eq(teamMembers.userId, params.nomineeUserId))).get();
  if (!nominee) throw new ServiceError(400, "You can only vote for a teammate");

  db.transaction((tx) => {
    const existing = tx.select({ id: superlativeVotes.id }).from(superlativeVotes).where(and(eq(superlativeVotes.categoryId, params.categoryId), eq(superlativeVotes.voterUserId, params.voterUserId))).get();
    if (existing) {
      tx.update(superlativeVotes).set({ nomineeUserId: params.nomineeUserId, updatedAt: clockNow() }).where(eq(superlativeVotes.id, existing.id)).run();
    } else {
      tx.insert(superlativeVotes).values({ categoryId: params.categoryId, teamId: params.teamId, voterUserId: params.voterUserId, nomineeUserId: params.nomineeUserId }).run();
    }
    // Votes are secret — no audit entry records who voted for whom.
    markAuditedNoop();
  });
}

/** Clears the caller's pick for a category, if they had one. Refused outside Live. */
export function clearVote(db: Db, bingo: Bingo, params: { categoryId: string; voterUserId: string }): void {
  assertVotingOpen(bingo);
  db.transaction((tx) => {
    tx.delete(superlativeVotes).where(and(eq(superlativeVotes.categoryId, params.categoryId), eq(superlativeVotes.voterUserId, params.voterUserId))).run();
    markAuditedNoop();
  });
}

// ---------------------------------------------------------------------------
// Results (winners for Wrapped, tallies for the admin-only read)
// ---------------------------------------------------------------------------

export interface CategoryWinners {
  categoryId: string;
  categoryName: string;
  winnerUserIds: string[];
}

/** Every category's winner(s) within one Team: the nominee(s) tied for the most votes. A category with no votes has none. */
export function computeWinners(db: Db, bingoId: string, teamId: string): CategoryWinners[] {
  const categories = getCategories(db, bingoId);
  if (categories.length === 0) return [];
  const votes = db.select({ categoryId: superlativeVotes.categoryId, nomineeUserId: superlativeVotes.nomineeUserId }).from(superlativeVotes).where(eq(superlativeVotes.teamId, teamId)).all();
  const countsByCategory = new Map<string, Map<string, number>>();
  for (const v of votes) {
    const counts = countsByCategory.get(v.categoryId) ?? new Map<string, number>();
    counts.set(v.nomineeUserId, (counts.get(v.nomineeUserId) ?? 0) + 1);
    countsByCategory.set(v.categoryId, counts);
  }
  return categories.flatMap((c) => {
    const counts = countsByCategory.get(c.id);
    if (!counts || counts.size === 0) return [];
    const max = Math.max(...counts.values());
    if (max <= 0) return [];
    const winnerUserIds = [...counts].filter(([, n]) => n === max).map(([userId]) => userId);
    return [{ categoryId: c.id, categoryName: c.name, winnerUserIds }];
  });
}

/**
 * How many of each Team's Players have voted so far: in any category, in every one, and per category. Counts only,
 * never who, so it's readable at any stage. Only current members count, as a removed Player's votes are gone.
 */
export function getTurnout(db: Db, bingo: Bingo): SuperlativeTeamTurnout[] {
  const categories = getCategories(db, bingo.id);
  const teamRows = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);
  const memberRows = db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all();
  const votes = categories.length
    ? db
        .select({ teamId: superlativeVotes.teamId, categoryId: superlativeVotes.categoryId, voterUserId: superlativeVotes.voterUserId })
        .from(superlativeVotes)
        .where(and(inArray(superlativeVotes.teamId, teamIds), inArray(superlativeVotes.categoryId, categories.map((c) => c.id))))
        .all()
    : [];

  return teamRows.map((team) => {
    const members = new Set(memberRows.filter((m) => m.teamId === team.id).map((m) => m.userId));
    const mine = votes.filter((v) => v.teamId === team.id && members.has(v.voterUserId));
    const categoriesOf = new Map<string, Set<string>>();
    for (const v of mine) categoriesOf.set(v.voterUserId, (categoriesOf.get(v.voterUserId) ?? new Set()).add(v.categoryId));
    return {
      teamId: team.id,
      teamName: team.name,
      color: team.color,
      players: members.size,
      votedAny: categoriesOf.size,
      votedAll: categories.length ? [...categoriesOf.values()].filter((c) => c.size === categories.length).length : 0,
      categories: categories.map((c) => ({ categoryId: c.id, categoryName: c.name, voted: new Set(mine.filter((v) => v.categoryId === c.id).map((v) => v.voterUserId)).size })),
    };
  });
}

export interface TeamTally {
  teamId: string;
  teamName: string;
  tallies: { categoryId: string; categoryName: string; counts: { user: AvatarUser; votes: number }[] }[];
}

/** Every Team's per-category vote counts. Admin-only, and refused before the bingo is Finished (voting hasn't closed). */
export function getTallies(db: Db, bingo: Bingo): TeamTally[] {
  if (bingo.stage !== "complete") throw new ServiceError(403, "Superlative vote counts aren't visible until the bingo is finished");
  const categories = getCategories(db, bingo.id);
  const teamRows = db.select().from(schema.teams).where(eq(schema.teams.bingoId, bingo.id)).all();
  if (categories.length === 0 || teamRows.length === 0) return teamRows.map((t) => ({ teamId: t.id, teamName: t.name, tallies: [] }));

  const votes = db
    .select({ teamId: superlativeVotes.teamId, categoryId: superlativeVotes.categoryId, nomineeUserId: superlativeVotes.nomineeUserId })
    .from(superlativeVotes)
    .where(inArray(superlativeVotes.teamId, teamRows.map((t) => t.id)))
    .all();
  const nomineeIds = [...new Set(votes.map((v) => v.nomineeUserId))];
  const userRows = nomineeIds.length ? withRsn(db, bingo.id, db.select(PUBLIC_USER_COLS).from(users).where(inArray(users.id, nomineeIds)).all()) : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return teamRows.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    tallies: categories.map((c) => {
      const counts = new Map<string, number>();
      for (const v of votes) if (v.teamId === team.id && v.categoryId === c.id) counts.set(v.nomineeUserId, (counts.get(v.nomineeUserId) ?? 0) + 1);
      return {
        categoryId: c.id,
        categoryName: c.name,
        counts: [...counts].sort((a, b) => b[1] - a[1]).map(([userId, n]) => ({ user: userById.get(userId)!, votes: n })).filter((c) => c.user),
      };
    }),
  }));
}
