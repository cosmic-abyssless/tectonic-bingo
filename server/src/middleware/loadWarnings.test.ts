// A burst of writes from one user, through a real router over a real in-memory DB, raises one write flood warning in
// Sentry naming the route's pattern (docs/postmortems/2026-10-03-colour-picker.md: an Admin dragging a colour picker).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { LoadWarnings } from "../loadWarnings";
import { countsTowardsLoad, loadWarningsMiddleware, routePattern } from "./loadWarnings";

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/node", () => ({ captureMessage, captureException: vi.fn(), setUser: vi.fn() }));
vi.mock("../ocr", () => ({ isOcrEnabled: () => false, analyzeSubmissionScreenshot: vi.fn() }));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../services/womCompetitionService", () => ({ syncWomCompetition: vi.fn(async () => {}), checkWomGroup: vi.fn(async () => ({ ok: true })) }));
vi.mock("../services/discordTeamService", () => ({ syncDiscordTeams: vi.fn(async () => {}), removeDiscordTeams: vi.fn(), getDiscordSyncStatus: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let admin: SessionUser;
let team: typeof schema.teams.$inferSelect;
let generatedTeam: typeof schema.teams.$inferSelect;
let warnings: LoadWarnings;
let server: Server;
let origin: string;

const TEAM_ROUTE = "PATCH /api/bingos/:slug/admin/teams/:id";

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: adminRouter } = await import("../routes/admin");
  const { errorHandler } = await import("./errorHandler");
  const { auditContext } = await import("../audit/middleware");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the Admin is logged in.
    (req as unknown as { user?: SessionUser }).user = admin;
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    next();
  });
  // As in index.ts: after auditContext, ahead of the routers.
  app.use(auditContext);
  app.use((req, res, next) => loadWarningsMiddleware(warnings)(req, res, next));
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use(errorHandler);
  server = app.listen(0);
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
  admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true, inGuild: true }).returning().get() as SessionUser;
  const bingo = (slug: string) => db.insert(schema.bingos).values({ slug, name: slug, boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "draft" }).returning().get();
  const teamIn = (bingoId: string) => db.insert(schema.teams).values({ bingoId, captainUserId: admin.id, name: "Team A", codeword: "alpha" }).returning().get();
  team = teamIn(bingo("b1").id);
  generatedTeam = teamIn(bingo("testdata-b2").id);
  // As configured, but a flood is 5 writes in a minute here.
  warnings = new LoadWarnings({ settings: { userWritesPerMin: 5 } });
  captureMessage.mockClear();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

async function burst(path: string, n: number): Promise<void> {
  const recorded = vi.spyOn(warnings, "recordRequest");
  // Several at once, as a colour picker's drag sends them.
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      fetch(`${origin}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color: `#12345${i % 10}` }) }),
    ),
  );
  // Each request is counted once its response has closed; then Sentry, loaded on demand, gets anything reported.
  await vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(n));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("a burst of writes from one user", () => {
  it("raises one write flood warning naming the route pattern", async () => {
    await burst(`/api/bingos/b1/admin/teams/${team.id}`, 10);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = captureMessage.mock.calls[0];
    expect(message).toBe(`Write flood: one user made 6 writes in a minute, most to ${TEAM_ROUTE}`);
    expect(context).toEqual({
      level: "warning",
      fingerprint: ["load-warning", "user_write_flood"],
      tags: { load_warning: "user_write_flood" },
      extra: { userId: admin.id, writes: 6, thresholdPerMin: 5, topRoutes: [{ route: TEAM_ROUTE, count: 6 }], bingoIds: [team.bingoId] },
    });
  });

  it("that are refused names the route pattern too", async () => {
    await burst("/api/bingos/b1/admin/teams/nope", 6);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][1].extra.topRoutes).toEqual([{ route: TEAM_ROUTE, count: 6 }]);
  });

  it("to a test data Bingo raises nothing", async () => {
    await burst(`/api/bingos/testdata-b2/admin/teams/${generatedTeam.id}`, 10);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe("routePattern", () => {
  it("puts the router's mount path and the route's path together, with the Bingo's slug as :slug", () => {
    expect(routePattern("/api/bingos/my-bingo/admin", "/teams/:id")).toBe("/api/bingos/:slug/admin/teams/:id");
    expect(routePattern("/api/bingos", "/:slug/board")).toBe("/api/bingos/:slug/board");
    expect(routePattern("/api/bingos", "/")).toBe("/api/bingos");
    expect(routePattern("", "/mcp")).toBe("/mcp");
  });
});

describe("countsTowardsLoad", () => {
  it("counts the API, logins and the MCP server, not health checks, uploads or the client", () => {
    for (const path of ["/api/bingos/b1/board", "/auth/discord/callback", "/mcp", "/token", "/.well-known/oauth-protected-resource"]) expect(countsTowardsLoad(path)).toBe(true);
    for (const path of ["/health", "/api/health", "/uploads/a.png", "/assets/index.js", "/wiki-icons/Bones.png", "/", "/bingos/b1"]) expect(countsTowardsLoad(path)).toBe(false);
  });
});
