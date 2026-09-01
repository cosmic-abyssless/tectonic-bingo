import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { users, signups } from "../db/schema";
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
export function seedTestSignups(db: Db, bingo: Bingo, count: number, tectonicRoster: TectonicRosterUser[] = []) {
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
  for (let i = 1; i <= count; i++) {
    const answers: signupService.SignupAnswerInput[] = questions.map((q) => ({
      questionId: q.id,
      value: q.type === "boolean" ? String(Math.random() < 0.5) : q.type === "select" ? firstOption(q.optionsJson) : "Test answer",
    }));

    const real = realCandidates[i - 1];
    if (real) {
      const rsn = real.rsns[0]!;
      // Reuse the existing user row if this real member already exists in
      // our DB (e.g. from a real login, or a prior seed run in another
      // bingo) — discordId is unique, a second insert would throw.
      const user = db.select().from(users).where(eq(users.discordId, real.user_id)).get() ?? db.insert(users).values({ discordId: real.user_id, discordUsername: rsn.rsn }).returning().get();
      created.push(
        signupService.createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: rsn.rsn, answers, womId: rsn.wom_id, rsnVerified: true }),
      );
    } else {
      const discordId = `dev-seed-${runSuffix}-${i}`;
      const user = db.insert(users).values({ discordId, discordUsername: `testbot_${runSuffix}_${i}` }).returning().get();
      created.push(signupService.createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: `TestBot${i}`, answers }));
    }
  }
  return created;
}
