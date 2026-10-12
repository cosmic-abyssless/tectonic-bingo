// A Reaction's broadcast (routes/bingos.ts): it carries the submission's reactions, so pages put them in instead of
// refetching the Team's list, and so it goes only to whoever may see that list. Real routers over a real in-memory DB,
// with the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { Stage } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let broadcast: ReturnType<typeof vi.fn>;
let admin: SessionUser;
let mod: SessionUser;
let playingMod: SessionUser;
let captain: SessionUser;
let player: SessionUser;
let rival: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  broadcast = (await import("../ws")).broadcast as unknown as ReturnType<typeof vi.fn>;
  const { default: bingosRouter } = await import("./bingos");
  const { auditContext } = await import("../audit/middleware");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as.
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/bingos", bingosRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/b1`;
});

afterAll(() => {
  server.close();
});

function wipe() {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
}

function setStage(stage: Stage) {
  db.update(schema.bingos).set({ stage }).where(eq(schema.bingos.id, bingo.id)).run();
}

async function react(as: SessionUser, submissionId: string, emoji: string, reacted = true) {
  actingAs = as;
  const res = await fetch(`${base}/submissions/${submissionId}/reactions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji, reacted }) });
  return { status: res.status, body: (await res.json()) as { reactions?: { emoji: string; users: { id: string }[] }[] } };
}

const reactionBroadcasts = () => broadcast.mock.calls.filter(([event]) => event.type === "submission_reactions_changed");

beforeEach(() => {
  wipe();
  broadcast.mockClear();
  const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: name, discordUsername: name, isAdmin }).returning().get();
  admin = user("admin", true);
  mod = user("mod");
  playingMod = user("playingmod");
  captain = user("captain");
  player = user("player");
  rival = user("rival");
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "live" }).returning().get();
  for (const m of [mod, playingMod]) db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: m.id }).run();
  for (const p of [captain, player, rival, playingMod]) db.insert(schema.signups).values({ bingoId: bingo.id, userId: p.id, rsn: p.discordUsername }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "alpha" }).returning().get();
  const other = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: rival.id, name: "Team B", codeword: "bravo" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: player.id }).run();
  db.insert(schema.teamMembers).values({ teamId: other.id, userId: rival.id, isCaptain: true }).run();
  // A Moderator who plays sees only their own Team, like any Player.
  db.insert(schema.teamMembers).values({ teamId: other.id, userId: playingMod.id }).run();
  setStage("live");
});

describe("a reaction's broadcast", () => {
  it("carries the submission's reactions, the same as the answer", async () => {
    const submission = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: captain.id }).returning().get();
    const { status, body } = await react(player, submission.id, "🔥");
    expect(status).toBe(200);
    expect(body.reactions).toEqual([{ emoji: "🔥", users: [expect.objectContaining({ id: player.id })] }]);
    const [[event]] = reactionBroadcasts();
    expect(event).toEqual({ type: "submission_reactions_changed", bingoId: bingo.id, payload: { teamId: team.id, changes: [{ submissionId: submission.id, reactions: body.reactions }] } });
  });

  it("goes only to whoever may see the Team's submissions: its Players, Moderators who aren't playing, and Admins", async () => {
    const submission = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: captain.id }).returning().get();
    await react(player, submission.id, "🔥");
    const [[, options]] = reactionBroadcasts();
    expect([...(options as { to: string[] }).to].sort()).toEqual([admin.id, captain.id, mod.id, player.id].sort());
  });
});
