// Historical Bingos (CONTEXT.md, #310): read-only, always Finished, and "not recorded" where the data isn't there.
// The real bingos, mod and admin routers over a real in-memory DB, hit over HTTP as a Site Admin, so every write route
// the app has is tried, not a hand-picked list.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Router } from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import { NOT_RECORDED_HISTORICAL, type BingoShellResponse, type HistoricalBingoResponse } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { seedHistoricalBingo, type HistoricalFixture } from "../testUtils/historicalFixture";

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
let clanMember: SessionUser;
let actingAs: SessionUser | null = null;
let fixture: HistoricalFixture;
let server: Server;
let base: string;
let routers: { prefix: string; router: Router }[];

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { default: adminRouter } = await import("./admin");
  const { default: siteAdminRouter } = await import("./siteAdmin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/admin", siteAdminRouter);
  app.use("/api/bingos", bingosRouter);
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  routers = [
    { prefix: "/api/bingos", router: bingosRouter },
    { prefix: "/api/bingos/:slug/mod", router: modRouter },
    { prefix: "/api/bingos/:slug/admin", router: adminRouter },
  ];
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

beforeEach(() => {
  wipe();
  admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  clanMember = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().get();
  fixture = seedHistoricalBingo(db, { slug: "hist", createdByUserId: admin.id });
});

async function call(as: SessionUser, method: string, path: string, body?: unknown) {
  actingAs = as;
  const res = await fetch(`${base}${path}`, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // an empty 204
  }
  return { status: res.status, body: json };
}

/** Every write route the three bingo routers declare, with its params filled in for the historical Bingo. */
function writeRoutes(): { method: string; path: string }[] {
  const found: { method: string; path: string }[] = [];
  for (const { prefix, router } of routers) {
    for (const layer of router.stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (method === "get") continue;
        const path = `${prefix}${layer.route.path}`.replace(":slug", "hist").replace(/:[A-Za-z]+/g, (param) => (param === ":teamId" ? fixture.teams[0]!.id : param === ":tileId" ? fixture.tiles[0]!.id : "x"));
        found.push({ method: method.toUpperCase(), path });
      }
    }
  }
  return found;
}

describe("a Historical Bingo is read-only", () => {
  it("refuses every write route, even to a Site Admin", async () => {
    const routes = writeRoutes();
    // Stage, Board, Teams, signups, Submissions and reactions are all among them.
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual(
      expect.arrayContaining(["POST /api/bingos/hist/mod/stage", "POST /api/bingos/hist/admin/tiles", "POST /api/bingos/hist/admin/teams", "POST /api/bingos/hist/signup", "POST /api/bingos/hist/submissions", "PUT /api/bingos/hist/submissions/x/reactions"]),
    );
    for (const route of routes) {
      const res = await call(admin, route.method, route.path, {});
      expect({ route: `${route.method} ${route.path}`, status: res.status, error: res.body.error }).toEqual({ route: `${route.method} ${route.path}`, status: 409, error: "Historical Bingos are read-only" });
    }
  });

  it("stays Finished and unchanged", async () => {
    await call(admin, "POST", "/api/bingos/hist/mod/stage", { stage: "live" });
    await call(admin, "PATCH", "/api/bingos/hist/admin/settings", { name: "Renamed" });
    const row = db.select().from(schema.bingos).where(eq(schema.bingos.id, fixture.bingo.id)).get()!;
    expect(row.stage).toBe("complete");
    expect(row.name).toBe(fixture.bingo.name);
  });

  it("refuses a stage change in the service too", async () => {
    const { advanceStage } = await import("../services/bingoService");
    expect(() => advanceStage(db, { bingoId: fixture.bingo.id, toStage: "live", changedByUserId: admin.id })).toThrow(/read-only/);
  });

  it("can still be deleted by a Site Admin, standings and all", async () => {
    const res = await call(admin, "DELETE", `/api/admin/bingos/${fixture.bingo.id}`);
    expect(res.status).toBe(204);
    expect(db.select().from(schema.bingos).all()).toHaveLength(0);
    expect(db.select().from(schema.historicalStandings).all()).toHaveLength(0);
  });

  it("leaves a normal Bingo's writes alone", async () => {
    db.insert(schema.bingos).values({ slug: "normal", name: "Normal", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "planning" }).run();
    const res = await call(admin, "PATCH", "/api/bingos/normal/admin/settings", { name: "Renamed" });
    expect(res.status).toBe(200);
  });
});

describe("what a Historical Bingo shows", () => {
  it("is visible to every clan member, flagged with what it recorded", async () => {
    const res = await call(clanMember, "GET", "/api/bingos/hist");
    expect(res.status).toBe(200);
    const shell = res.body as unknown as BingoShellResponse;
    expect(shell.bingo.historical).toBe(true);
    expect(shell.bingo.stage).toBe("complete");
    expect(shell.historical).toEqual({ tasks: false, submissions: false, signupRoster: false, draft: false, womSnapshots: false });
    expect(shell.teams.map((t) => t.members.length)).toEqual([3, 3, 3]);
  });

  it("gives the board's Tiles their pictures and rules text", async () => {
    const res = await call(clanMember, "GET", "/api/bingos/hist/board");
    const tiles = (res.body as { tiles: { name: string; imageUrl: string; rulesText: string | null; node: { points: number } }[] }).tiles;
    expect(tiles).toHaveLength(9);
    expect(tiles.find((t) => t.name === "Vorkath")).toMatchObject({ imageUrl: "/uploads/historical-0-0.png", rulesText: "Any unique from Vorkath.", node: { points: 10 } });
  });

  it("serves the standings and a WOM leaderboard, with the unknown Player by RSN only", async () => {
    const res = await call(clanMember, "GET", "/api/bingos/hist/historical");
    expect(res.status).toBe(200);
    const body = res.body as unknown as HistoricalBingoResponse;
    expect(body.standings.map((s) => [s.teamName, s.place, s.points])).toEqual([
      ["Fire Giants", 1, 212],
      ["Ice Trolls", 2, 187],
      ["Moss Knights", 3, null],
    ]);
    expect(body.wom?.teams.map((t) => [t.name, t.players])).toEqual([
      ["Fire Giants", 3],
      ["Ice Trolls", 3],
      ["Moss Knights", 4],
    ]);
    const mystery = body.wom!.players.find((p) => p.rsn === "Mystery Man")!;
    expect(mystery).toMatchObject({ user: null, teamName: "Moss Knights", gained: 42.5 });
    // A Player who left the clan is still named by their RSN then, and mapped to their Team.
    const ash = body.wom!.players.find((p) => p.rsn === "Ash Heap")!;
    expect(ash.user?.rsn).toBe("Ash Heap");
    expect(ash.teamId).toBe(fixture.teams[0]!.id);
  });

  it("says Not recorded where the data isn't there, and for Wrapped, the audit log and Achievements always", async () => {
    for (const path of ["/api/bingos/hist/stats", "/api/bingos/hist/rewind", "/api/bingos/hist/wrapped", "/api/bingos/hist/wrapped/me", "/api/bingos/hist/draft", "/api/bingos/hist/achievements", "/api/bingos/hist/mod/audit-log", "/api/bingos/hist/mod/signups"]) {
      const res = await call(admin, "GET", path);
      expect({ path, status: res.status, error: res.body.error }).toEqual({ path, status: 404, error: NOT_RECORDED_HISTORICAL });
    }
  });

  it("answers 404 for the historical endpoint of a normal Bingo", async () => {
    db.insert(schema.bingos).values({ slug: "normal", name: "Normal", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "complete" }).run();
    expect((await call(admin, "GET", "/api/bingos/normal/historical")).status).toBe(404);
    expect(((await call(admin, "GET", "/api/bingos/normal")).body as unknown as BingoShellResponse).historical).toBeNull();
  });

  it("lists after every other Bingo, so nobody lands on one", async () => {
    db.insert(schema.bingos).values({ slug: "current", name: "Current", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "live", createdAt: new Date("2020-01-01") }).run();
    const res = await call(clanMember, "GET", "/api/bingos");
    expect((res.body.bingos as { slug: string }[]).map((b) => b.slug)).toEqual(["current", "hist"]);
  });
});
