// Renaming a Team (CONTEXT.md "Team name"): its Captain from the Team dialog only during Board revealed, an Admin from
// the mod panel at any stage. Real routers over a real in-memory DB, with the logged-in user faked, hit over HTTP.
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
let admin: SessionUser;
let captain: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: adminRouter } = await import("./admin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as.
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos/:slug/admin", adminRouter);
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

async function rename(as: SessionUser, path: string, name: string) {
  actingAs = as;
  const res = await fetch(`${base}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  return { status: res.status, body: (await res.json()) as { error?: string; team?: { name: string } } };
}

beforeEach(() => {
  wipe();
  admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  captain = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().get();
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "draft" }).returning().get();
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: captain.id, rsn: "captain" }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();
});

describe("a Captain renaming their Team", () => {
  it("is refused before Board revealed, while the Draft hasn't set the Team", async () => {
    for (const stage of ["captains", "draft"] as const) {
      setStage(stage);
      expect(await rename(captain, `/teams/${team.id}`, "Early")).toEqual({ status: 400, body: { error: "Team names can be changed once the Board is revealed" } });
    }
  });

  it("works during Board revealed", async () => {
    setStage("reveal");
    const { status, body } = await rename(captain, `/teams/${team.id}`, "  Revealed  ");
    expect(status).toBe(200);
    expect(body.team?.name).toBe("Revealed");
  });

  it("is refused once the Bingo is Live", async () => {
    for (const stage of ["live", "complete"] as const) {
      setStage(stage);
      expect(await rename(captain, `/teams/${team.id}`, "Late")).toEqual({ status: 400, body: { error: "Team names are locked once the Bingo is Live" } });
    }
  });
});

describe("an Admin renaming a Team from the mod panel", () => {
  it.each(["draft", "reveal", "live"] as const)("works during %s", async (stage) => {
    setStage(stage);
    const { status, body } = await rename(admin, `/admin/teams/${team.id}`, `Fixed in ${stage}`);
    expect(status).toBe(200);
    expect(body.team?.name).toBe(`Fixed in ${stage}`);
  });
});
