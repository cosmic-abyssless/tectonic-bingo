// Member pick questions (CONTEXT.md): who can be picked, and the names picks are shown by. A pick is stored as a user
// id; the name is looked up whenever the answer is read, so it's always the member's current one.
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { discordName, parseMemberPicks, type PickableMember } from "@bingo/shared";
import * as schema from "../db/schema";
import { signupQuestions, signups, users } from "../db/schema";
import { rsnsInBingo } from "./playerNames";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const NAME_COLS = { id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick };

/** userId -> the RSN of their latest signup in any bingo, for those who have one. `userIds` omitted: everyone's. */
function latestRsns(db: Db | Tx, userIds?: readonly string[]): Map<string, string> {
  if (userIds && userIds.length === 0) return new Map();
  const rows = db
    .select({ userId: signups.userId, rsn: signups.rsn })
    .from(signups)
    .where(userIds ? inArray(signups.userId, [...new Set(userIds)]) : undefined)
    .orderBy(desc(signups.createdAt))
    .all();
  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.userId)) latest.set(r.userId, r.rsn);
  return latest;
}

/**
 * Everyone a Member pick question in this bingo can pick: every clan member who has logged in (users in the guild),
 * except the person answering. Named by the RSN of their latest signup, or their Discord name if they've never
 * signed up. Only names go out: nothing about the account itself (admin flags, timestamps, Discord ids).
 */
export function getPickableMembers(db: Db, answererUserId?: string): PickableMember[] {
  const rows = db
    .select(NAME_COLS)
    .from(users)
    .where(answererUserId ? and(eq(users.inGuild, true), ne(users.id, answererUserId)) : eq(users.inGuild, true))
    .all();
  const rsns = latestRsns(db);
  return rows
    .map((u) => ({ userId: u.id, name: rsns.get(u.id) ?? discordName(u), discordName: discordName(u) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * userId -> the name a picked member is shown by in this bingo: the RSN they signed up to it with, else their latest
 * signup's RSN, else their Discord name. Whether they're still in the clan doesn't matter: a pick keeps its name.
 */
export function memberNames(db: Db | Tx, bingoId: string, userIds: readonly string[]): Map<string, string> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const inBingo = rsnsInBingo(db, bingoId, ids);
  const latest = latestRsns(db, ids.filter((id) => !inBingo.has(id)));
  const rows = db.select(NAME_COLS).from(users).where(inArray(users.id, ids)).all();
  return new Map(rows.map((u) => [u.id, inBingo.get(u.id) ?? latest.get(u.id) ?? discordName(u)]));
}

/** A stored Member pick answer in the form it's read in: each pick with its member's current name on. */
function named(value: string, names: ReadonlyMap<string, string>): string {
  const picks = parseMemberPicks(value);
  if (picks.length === 0) return value;
  return JSON.stringify(picks.map((p) => ({ id: p.id, name: names.get(p.id) ?? null })));
}

/** One stored Member pick answer with its names on (see withMemberNames). */
export function nameMemberPicks(db: Db | Tx, bingoId: string, value: string): string {
  return named(value, memberNames(db, bingoId, parseMemberPicks(value).map((p) => p.id)));
}

/**
 * The answers with every Member pick answer among them in the form it's read in, names on (see signupAnswers.ts).
 * Everything that sends a bingo's answers to a client goes through this; other answers pass through untouched.
 */
export function withMemberNames<T extends { questionId: string; value: string }>(db: Db | Tx, bingoId: string, answers: T[]): T[] {
  if (answers.length === 0) return answers;
  const memberQuestionIds = new Set(
    db
      .select({ id: signupQuestions.id })
      .from(signupQuestions)
      .where(and(eq(signupQuestions.bingoId, bingoId), eq(signupQuestions.type, "member")))
      .all()
      .map((q) => q.id),
  );
  if (memberQuestionIds.size === 0) return answers;
  const picked = answers.filter((a) => memberQuestionIds.has(a.questionId));
  const names = memberNames(db, bingoId, picked.flatMap((a) => parseMemberPicks(a.value).map((p) => p.id)));
  return answers.map((a) => (memberQuestionIds.has(a.questionId) ? { ...a, value: named(a.value, names) } : a));
}

/** The users among `userIds` who exist and are in the clan (guild) right now. */
export function inGuildUserIds(db: Db | Tx, userIds: readonly string[]): Set<string> {
  if (userIds.length === 0) return new Set();
  return new Set(db.select({ id: users.id }).from(users).where(and(inArray(users.id, [...new Set(userIds)]), eq(users.inGuild, true))).all().map((u) => u.id));
}
