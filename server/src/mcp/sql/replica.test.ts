// The clean replica and run_sql over it (#292): secrets never reach the copy, only a single read-only query runs,
// a runaway query is stopped without stalling the site, and answers say how old their data is.
import fs from "fs";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../../testUtils/testDb";
import { bingos, feedbackAnswers, feedbackResponses, oauthClients, oauthTokens, phoneLoginLinks, pickRatings, signups, signupQuestions, superlativeCategories, superlativeVotes, teams, users } from "../../db/schema";
import { McpToolError } from "../tool";
import { runSqlQuery, SQL_LIMITS } from "../tools/runSql";
import { describeSchema } from "../tools/describeSchema";
import { buildReplica, currentReplica, resetReplica } from "./replica";
import { ChildQueryError, runInChild } from "./child";
import { addSessionStore, saveTo, tempDir } from "../../testUtils/mcpSql";

const SECRETS = ["wom-verification-SECRET", "session-SECRET", "token-hash-SECRET", "rating-note-SECRET", "oauth-client-SECRET", "access-hash-SECRET", "feedback-key-SECRET"];

let tmp: ReturnType<typeof tempDir>;
let source: string;
let replicaPath: string;

/** A live-shaped database with one of every secret #292 names, written to disk. */
function seedSource(file: string): string {
  const { sqlite, db } = createTestDb();
  addSessionStore(sqlite);
  const user = (name: string) => db.insert(users).values({ discordId: `d-${name}`, discordUsername: name }).returning().get().id;
  const admin = user("admin");
  const alice = user("alice");
  const voter = user("voter");
  const bingo = db.insert(bingos).values({ slug: "summer", name: "Summer Bingo", boardRows: 5, boardCols: 5, createdByUserId: admin, womGroupVerificationCode: "wom-verification-SECRET" }).returning().get();
  const team = db.insert(teams).values({ bingoId: bingo.id, captainUserId: alice, name: "Team A", codeword: "a" }).returning().get();
  const signup = db.insert(signups).values({ bingoId: bingo.id, userId: alice, rsn: "Alice RSN" }).returning().get();
  db.insert(pickRatings).values({ teamId: team.id, signupId: signup.id, stars: 3, note: "rating-note-SECRET" }).run();
  db.insert(phoneLoginLinks).values({ tokenHash: "token-hash-SECRET", userId: alice, expiresAt: new Date() }).run();
  db.insert(oauthClients).values({ clientId: "c1", clientSecret: "oauth-client-SECRET", metadataJson: "{}" }).run();
  db.insert(oauthTokens).values({ accessTokenHash: "access-hash-SECRET", refreshTokenHash: "r", userId: admin, clientId: "c1", scope: "s", resource: "r", accessExpiresAt: new Date(), lastUsedAt: new Date() }).run();
  const category = db.insert(superlativeCategories).values({ bingoId: bingo.id, name: "MVP" }).returning().get();
  db.insert(superlativeVotes).values({ categoryId: category.id, teamId: team.id, voterUserId: voter, nomineeUserId: alice }).run();
  const question = db.insert(signupQuestions).values({ bingoId: bingo.id, form: "feedback", prompt: "How was it?", type: "text" }).returning().get();
  const response = db.insert(feedbackResponses).values({ bingoId: bingo.id, kind: "player", respondentKey: "feedback-key-SECRET", keyCheck: "key-check-SECRET" }).returning().get();
  db.insert(feedbackAnswers).values({ responseId: response.id, questionId: question.id, value: "Great" }).run();
  sqlite.prepare("INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)").run("session-SECRET", "{}", "2099-01-01");
  return saveTo(sqlite, file);
}

beforeAll(async () => {
  tmp = tempDir();
  source = seedSource(path.join(tmp.dir, "bingo.db"));
  replicaPath = path.join(tmp.dir, "replica", "mcp-replica.db");
  await buildReplica(source, replicaPath);
});

afterAll(() => {
  resetReplica();
  tmp.cleanup();
});

describe("replica", () => {
  it("leaves out denied tables and columns and keeps allowed data", () => {
    const replica = new Database(replicaPath, { readonly: true });
    const tables = replica.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
    for (const t of ["sessions", "phone_login_links", "pick_ratings", "oauth_clients", "oauth_codes", "oauth_tokens"]) expect(tables).not.toContain(t);
    const bingoColumns = replica.prepare("SELECT name FROM pragma_table_info('bingos')").pluck().all();
    expect(bingoColumns).not.toContain("wom_group_verification_code");
    expect(bingoColumns).toContain("slug");
    expect(replica.prepare("SELECT name FROM pragma_table_info('superlative_votes')").pluck().all()).not.toContain("voter_user_id");

    // Feedback is anonymous: the key that finds a response again is denied, though its answers are readable.
    expect(replica.prepare("SELECT name FROM pragma_table_info('feedback_responses')").pluck().all()).not.toContain("respondent_key");
    expect(replica.prepare("SELECT value FROM feedback_answers").pluck().all()).toEqual(["Great"]);
    expect(replica.prepare("SELECT slug, name FROM bingos").all()).toEqual([{ slug: "summer", name: "Summer Bingo" }]);
    expect(replica.prepare("SELECT rsn FROM signups").pluck().all()).toEqual(["Alice RSN"]);
    expect(replica.prepare("SELECT count(*) FROM superlative_votes").pluck().get()).toBe(1);
    expect(replica.prepare("SELECT discord_id FROM users ORDER BY discord_id").pluck().all()).toEqual(["d-admin", "d-alice", "d-voter"]);
    replica.close();
  });

  it("has no trace of a secret anywhere in the file", () => {
    const bytes = fs.readFileSync(replicaPath).toString("latin1");
    expect(SECRETS.filter((secret) => bytes.includes(secret))).toEqual([]);
    // The source really had them, so the check above means something.
    const sourceBytes = fs.readFileSync(source).toString("latin1");
    expect(SECRETS.filter((secret) => sourceBytes.includes(secret))).toEqual(SECRETS);
  });

  it("keeps the previous replica when a build fails", async () => {
    const before = currentReplica();
    await expect(buildReplica(path.join(tmp.dir, "missing.db"), replicaPath)).rejects.toThrow();
    expect(currentReplica()).toBe(before);
    expect(fs.existsSync(replicaPath)).toBe(true);
  });
});

describe("run_sql", () => {
  afterEach(async () => {
    // Other tests move builtAt; put back a fresh one.
    await buildReplica(source, replicaPath);
  });

  it("answers with column names, rows and the data's age", async () => {
    await buildReplica(source, replicaPath, () => new Date(Date.now() - 3 * 60_000 - 5_000));
    const answer = await runSqlQuery("-- which bingos\nSELECT slug, board_rows FROM bingos");
    expect(answer).toMatchObject({ columns: ["slug", "board_rows"], rows: [["summer", 5]], rowCount: 1, truncated: null, dataAge: "data as of 3 minutes ago" });
    expect(new Date(answer.dataAsOf).getTime()).toBe(currentReplica()!.builtAt.getTime());
  });

  it.each([
    ["INSERT INTO bingos (slug) VALUES ('x')"],
    ["UPDATE bingos SET name = 'x'"],
    ["DELETE FROM bingos"],
    [`ATTACH '${"x"}' AS live`],
    ["PRAGMA query_only = OFF"],
    ["PRAGMA writable_schema = ON"],
    ["DROP TABLE bingos"],
    ["BEGIN"],
    ["WITH x AS (SELECT 1) DELETE FROM bingos"],
    ["/* sneaky */ INSERT INTO bingos (slug) VALUES ('x')"],
  ])("refuses %s", async (query) => {
    await expect(runSqlQuery(query)).rejects.toThrow(McpToolError);
    expect((await runSqlQuery("SELECT count(*) FROM bingos")).rows).toEqual([[1]]);
  });

  it("refuses statements that write or attach even past the keyword check", async () => {
    // The child's own checks, without the keyword filter in front: a read-only connection, query_only, and only a
    // statement that returns rows.
    const job = (sql: string) => runInChild({ mode: "query", path: replicaPath, sql, rowLimit: 10, charBudget: 10_000, cellLimit: 100 }, 5_000);
    await expect(job(`ATTACH '${source}' AS live`)).rejects.toThrow(ChildQueryError);
    await expect(job("PRAGMA query_only = OFF")).rejects.toThrow(ChildQueryError);
    await expect(job("DELETE FROM bingos")).rejects.toThrow(ChildQueryError);
    await expect(job("SELECT load_extension('x')")).rejects.toThrow(/not authorized/);
  });

  it("refuses more than one statement", async () => {
    await expect(runSqlQuery("SELECT 1; SELECT 2")).rejects.toThrow(/more than one statement/);
    await expect(runSqlQuery("SELECT 1; DELETE FROM bingos")).rejects.toThrow(McpToolError);
  });

  it("stops a long query at the time limit while the main thread keeps running", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const started = Date.now();
    await expect(
      runSqlQuery("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c", { ...SQL_LIMITS, timeoutMs: 1_000 }),
    ).rejects.toThrow(/longer than 1 seconds and was stopped/);
    clearInterval(timer);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5_000);
    // The event loop ran all along: roughly one tick per 10 ms.
    expect(ticks).toBeGreaterThan(elapsed / 10 / 3);
  });

  it("cuts results at the row limit and says so", async () => {
    const answer = await runSqlQuery("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 1500) SELECT x FROM c");
    expect(answer.rowCount).toBe(SQL_LIMITS.rowLimit);
    expect(answer.rows[999]).toEqual([1000]);
    expect(answer.truncated).toMatch(/1000-row limit/);

    const exact = await runSqlQuery("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 1000) SELECT x FROM c");
    expect(exact).toMatchObject({ rowCount: 1000, truncated: null });
  });

  it("cuts results that grow too large, and long values", async () => {
    const answer = await runSqlQuery("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 500) SELECT x, printf('%.5000c', 'a') AS big FROM c", { ...SQL_LIMITS, charBudget: 50_000 });
    expect(answer.rowCount).toBeLessThan(500);
    expect(answer.truncated).toMatch(/too large/);
    expect(String(answer.rows[0][1])).toMatch(/… \[1000 more characters\]$/);
  });

  it("says the copy isn't ready before the first build", async () => {
    resetReplica();
    await expect(runSqlQuery("SELECT 1")).rejects.toThrow(/isn't ready yet/);
  });
});

describe("describe_schema", () => {
  it("lists allowed tables and columns only, with notes, types and the data's age", async () => {
    await buildReplica(source, replicaPath);
    const out = (await describeSchema.run({}, {} as never)) as { notes: string[]; dataAge: string; tables: { name: string; columns: { name: string; type: string; note?: string }[] }[] };
    const names = out.tables.map((t) => t.name);
    expect(names).toContain("submissions");
    for (const t of ["sessions", "phone_login_links", "pick_ratings", "oauth_tokens"]) expect(names).not.toContain(t);
    const bingoColumns = out.tables.find((t) => t.name === "bingos")!.columns.map((c) => c.name);
    expect(bingoColumns).not.toContain("wom_group_verification_code");
    expect(out.tables.find((t) => t.name === "submissions")!.columns.find((c) => c.name === "submitted_by_user_id")).toEqual({
      name: "submitted_by_user_id",
      type: "text",
      note: "The Player the drop is credited to",
    });
    expect(out.notes.join(" ")).toMatch(/Scores aren't a column/);
    expect(out.dataAge).toBe("data as of less than a minute ago");
  });
});
