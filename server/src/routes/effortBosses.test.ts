// Effort bosses (CONTEXT.md "Effort"), answered by the admin routes themselves over a real in-memory DB, with the
// logged-in user faked, hit over HTTP: only Admins read and edit them, on the Draft board, and not once the board is locked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BoardEffortBossesResponse, Stage } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createTask, createTile } from "../services/boardService";
import { hasDraft } from "../services/boardDraftService";

vi.mock("../ocr", () => ({ isOcrEnabled: () => false, analyzeSubmissionScreenshot: vi.fn() }));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
type Person = "admin" | "mod" | "player";
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let vorkath: typeof schema.tiles.$inferSelect;
let head: { id: string };
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: adminRouter } = await import("./admin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/b1/admin`;
});

afterAll(() => {
  server.close();
});

function wipe() {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")
    .all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
}

function setStage(stage: Stage) {
  db.update(schema.bingos).set({ stage }).where(eq(schema.bingos.id, bingo.id)).run();
}

async function call(as: Person, method: string, path: string, body?: unknown) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as BoardEffortBossesResponse };
}

beforeEach(() => {
  wipe();
  const user = (discordId: string, extra: Partial<SessionUser> = {}) =>
    db
      .insert(schema.users)
      .values({ discordId, discordUsername: discordId, ...extra })
      .returning()
      .get();
  people = { admin: user("admin", { isAdmin: true }), mod: user("mod"), player: user("player") };
  bingo = db
    .insert(schema.bingos)
    .values({ slug: "b1", name: "B1", boardRows: 1, boardCols: 1, createdByUserId: people.admin.id, stage: "live" })
    .returning()
    .get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  head = createTask(db, vorkath.id, { kind: "ITEM", label: "Head", points: 40, itemName: "Vorkath's head" }, 0);
});

describe("Effort boss routes", () => {
  it("are for Admins only", async () => {
    for (const who of ["player", "mod"] as const) {
      expect((await call(who, "GET", "/effort-bosses")).status).toBe(403);
      expect((await call(who, "POST", `/parts/${head.id}/effort-bosses`, { metric: "zulrah", mode: "add" })).status).toBe(403);
    }
    expect(db.select().from(schema.draftEffortBosses).all()).toEqual([]);
  });

  it("add, remove and reset on the Draft board, each answering with the board's Effort bosses", async () => {
    const before = await call("admin", "GET", "/effort-bosses");
    expect(before.body).toEqual({ bosses: [], derived: [{ partId: head.id, metrics: ["vorkath"] }] });

    const added = await call("admin", "POST", `/tiles/${vorkath.id}/effort-bosses`, { metric: "zulrah", mode: "add" });
    expect(added.status).toBe(201);
    expect(added.body.bosses).toEqual([{ id: expect.any(String), tileId: vorkath.id, partId: null, metric: "zulrah", mode: "add" }]);
    expect(hasDraft(db, bingo.id)).toBe(true);
    // The editor reads the draft's while there is one; the Published board has none yet.
    expect((await call("admin", "GET", "/effort-bosses")).body.bosses).toHaveLength(1);
    expect(db.select().from(schema.effortBosses).all()).toEqual([]);

    const removed = await call("admin", "POST", `/parts/${head.id}/effort-bosses`, { metric: "vorkath", mode: "remove" });
    expect(removed.body.bosses.map((b) => [b.metric, b.mode])).toEqual(
      expect.arrayContaining([
        ["zulrah", "add"],
        ["vorkath", "remove"],
      ]),
    );
    expect((await call("admin", "POST", `/parts/${head.id}/effort-bosses`, { metric: "wintertodt", mode: "add" })).status).toBe(400);

    for (const b of removed.body.bosses) expect((await call("admin", "DELETE", `/effort-bosses/${b.id}`)).status).toBe(200);
    expect(hasDraft(db, bingo.id)).toBe(false);
  });

  it("can't change them once the board is locked (the bingo is Finished)", async () => {
    setStage("complete");
    expect((await call("admin", "POST", `/parts/${head.id}/effort-bosses`, { metric: "zulrah", mode: "add" })).status).toBe(400);
    expect((await call("admin", "GET", "/effort-bosses")).status).toBe(200);
  });
});
