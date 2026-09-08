import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import { users, signups, signupAnswers } from "../db/schema";
import * as signupService from "./signupService";
import type { TectonicRosterUser } from "./tectonicService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

function firstOption(optionsJson: string | null): string {
  if (!optionsJson) return "Test answer";
  try {
    const opts = JSON.parse(optionsJson) as unknown;
    return Array.isArray(opts) && typeof opts[0] === "string" ? opts[0] : "Test answer";
  } catch {
    return "Test answer";
  }
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function weightedPick<T extends string>(weights: Array<[T, number]>): T {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of weights) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1]![0];
}

// Fabricated WOM/RuneProfile data for seeded test signups — never a real
// network call. This is purely for exercising the draft pool table's
// EHB/account-type columns with realistic-looking variety; hitting the real
// APIs for up to 50 signups at once (routes/mod.ts's per-call cap) would be
// both slow and pointless rate-limit exposure for throwaway test data. Real
// signups (routes/bingos.ts POST/PATCH /:slug/signup) still fetch real data
// via playerStatsService.ts — this only applies to this dev tool.
// Weighted roughly like a real clan's composition: mostly mains, then
// ironmen, then progressively rarer hardcore/ultimate/group variants —
// close to what the actual clan's WOM group looked like when checked.
const FAKE_RUNEPROFILE_TYPE_WEIGHTS: Array<[string, number]> = [
  ["normal", 55],
  ["ironman", 25],
  ["group_ironman", 10],
  ["unranked_group_ironman", 5],
  ["hardcore_ironman", 3],
  ["ultimate_ironman", 1],
  ["hardcore_group_ironman", 1],
];
const FAKE_WOM_TYPE_WEIGHTS: Array<[string, number]> = [
  ["regular", 60],
  ["ironman", 30],
  ["hardcore", 6],
  ["ultimate", 4],
];

function fakePlayerStats(rsn: string): { womDataJson: string; runeProfileDataJson: string } {
  const ehb = Math.round(Math.random() * 2000 * 100) / 100;
  const womType = weightedPick(FAKE_WOM_TYPE_WEIGHTS);
  const runeProfileType = weightedPick(FAKE_RUNEPROFILE_TYPE_WEIGHTS);
  return {
    womDataJson: JSON.stringify({ ehb, type: womType }),
    runeProfileDataJson: JSON.stringify({ username: rsn, accountType: { id: 0, key: runeProfileType, name: runeProfileType } }),
  };
}

// Dev-only test data generator, for exercising the draft with a realistic
// pool of players without manually signing up a dozen browser tabs. Only
// reachable via the route gate in routes/mod.ts (same NODE_ENV/
// DEV_LOGIN_ENABLED check as /auth/dev-login) — never available in
// production. Goes through the real signupService.createSignup, so it's
// subject to the same signup-stage gate and required-question validation as
// a real player.
//
// `tectonicRoster` is fetched by the route (this file stays sync/DB-pure,
// same convention as the rest of the service layer — see routes/bingos.ts's
// getTectonicMembership). When it's non-empty, seeded signups are drawn from
// real clan members — real RSN, real womId, rsnVerified: true — so the
// verified badge and EHB/total-level columns actually have something to
// show. That's legitimate here (unlike a real signup) because this is a
// mod-only dev tool sourcing directly from tectonic-api itself, not
// re-trusting a client-sent claim. Falls back to synthetic TestBot
// placeholders once real candidates run out, or entirely when the roster is
// empty (integration off, or genuinely no members left to draw from).
export type SeedSource = "tectonic" | "synthetic" | "mixed";

export function seedTestSignups(db: Db, bingo: Bingo, count: number, tectonicRoster: TectonicRosterUser[] = []): { signups: Array<ReturnType<typeof signupService.createSignup>>; source: SeedSource } {
  const questions = signupService.getQuestions(db, bingo.id);
  const runSuffix = crypto.randomUUID().slice(0, 8);

  // Unique index on (bingoId, userId) blocks a re-signup even for a
  // withdrawn row, so exclude anyone already signed up (any status) rather
  // than just active ones — repeated "seed N more" calls would otherwise
  // throw on the first already-used real candidate.
  const alreadySignedUp = new Set(
    db
      .select({ discordId: users.discordId })
      .from(signups)
      .innerJoin(users, eq(signups.userId, users.id))
      .where(eq(signups.bingoId, bingo.id))
      .all()
      .map((r) => r.discordId),
  );
  const realCandidates = shuffled(tectonicRoster.filter((r) => r.rsns.length > 0 && !alreadySignedUp.has(r.user_id)));

  const created = [];
  let realCount = 0;
  for (let i = 1; i <= count; i++) {
    const answers: signupService.SignupAnswerInput[] = questions.map((q) => ({
      questionId: q.id,
      value: q.type === "boolean" ? String(Math.random() < 0.5) : q.type === "select" ? firstOption(q.optionsJson) : "Test answer",
    }));

    const real = realCandidates[i - 1];
    let signup;
    let rsnForStats: string;
    if (real) {
      realCount++;
      const rsn = real.rsns[0]!;
      // Reuse the existing user row if this real member already exists in
      // our DB (e.g. from a real login, or a prior seed run in another
      // bingo) — discordId is unique, a second insert would throw.
      const user = db.select().from(users).where(eq(users.discordId, real.user_id)).get() ?? db.insert(users).values({ discordId: real.user_id, discordUsername: rsn.rsn }).returning().get();
      signup = signupService.createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: rsn.rsn, answers, womId: rsn.wom_id, rsnVerified: true });
      rsnForStats = rsn.rsn;
    } else {
      const discordId = `dev-seed-${runSuffix}-${i}`;
      const user = db.insert(users).values({ discordId, discordUsername: `testbot_${runSuffix}_${i}` }).returning().get();
      rsnForStats = `TestBot${i}`;
      signup = signupService.createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: rsnForStats, answers });
    }

    const { womDataJson, runeProfileDataJson } = fakePlayerStats(rsnForStats);
    db.update(signups).set({ womDataJson, runeProfileDataJson, statsFetchedAt: new Date() }).where(eq(signups.id, signup.id)).run();
    created.push(signup);
  }
  const source: SeedSource = realCount === created.length ? "tectonic" : realCount === 0 ? "synthetic" : "mixed";
  return { signups: created, source };
}

// Dev-only counterpart to seedTestSignups: wipes every signup (and its
// answers) for the bingo so a seed run can be redone from scratch. Only
// meaningful during the signup stage — the route enforces that.
export function deleteAllSignups(db: Db, bingoId: string): number {
  return db.transaction((tx) => {
    const ids = tx.select({ id: signups.id }).from(signups).where(eq(signups.bingoId, bingoId)).all().map((r) => r.id);
    if (ids.length === 0) return 0;
    tx.delete(signupAnswers).where(inArray(signupAnswers.signupId, ids)).run();
    tx.delete(signups).where(eq(signups.bingoId, bingoId)).run();
    return ids.length;
  });
}
