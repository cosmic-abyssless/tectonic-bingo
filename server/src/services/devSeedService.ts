import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import * as signupService from "./signupService";

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

// Dev-only test data generator, for exercising the draft with a realistic
// pool of players without manually signing up a dozen browser tabs. Only
// reachable via the route gate in routes/mod.ts (same NODE_ENV/
// DEV_LOGIN_ENABLED check as /auth/dev-login) — never available in
// production. Goes through the real signupService.createSignup, so it's
// subject to the same signup-stage gate and required-question validation as
// a real player.
export function seedTestSignups(db: Db, bingo: Bingo, count: number) {
  const questions = signupService.getQuestions(db, bingo.id);
  const runSuffix = crypto.randomUUID().slice(0, 8);

  const created = [];
  for (let i = 1; i <= count; i++) {
    const discordId = `dev-seed-${runSuffix}-${i}`;
    const user = db.insert(users).values({ discordId, discordUsername: `testbot_${runSuffix}_${i}` }).returning().get();

    const answers: signupService.SignupAnswerInput[] = questions.map((q) => ({
      questionId: q.id,
      value: q.type === "boolean" ? String(Math.random() < 0.5) : q.type === "select" ? firstOption(q.optionsJson) : "Test answer",
    }));

    created.push(signupService.createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: `TestBot${i}`, answers }));
  }
  return created;
}
