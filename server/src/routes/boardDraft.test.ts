// The Draft board over HTTP (CONTEXT.md "Draft board", #437): an Admin's edits through the real admin routes reach
// only the Admins' editor, never a Player- or Moderator-facing response, until the Admin publishes them. A real
// bingos/mod/admin router stack over a real in-memory DB, with the logged-in user faked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { DraftBoardResponse, PublishPreview } from "@bingo/shared";
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
type Person = "admin" | "mod" | "player";
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let tile: { id: string; nodeId: string };
let task: { id: string };
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

// Everything the draft adds carries this, so a response that leaks any of it is easy to spot.
const SECRET = "SECRETDRAFT";

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { default: adminRouter } = await import("./admin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos", bingosRouter);
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use("/api/bingos/:slug/admin", adminRouter);
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

async function call(as: Person, method: string, path: string, body?: unknown) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await res.text();
  return { status: res.status, raw, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
}

beforeEach(async () => {
  wipe();
  const user = (discordId: string, extra: Partial<SessionUser> = {}) => db.insert(schema.users).values({ discordId, discordUsername: discordId, ...extra }).returning().get();
  people = { admin: user("admin", { isAdmin: true }), mod: user("mod"), player: user("player") };
  bingo = db
    .insert(schema.bingos)
    .values({ slug: "b1", name: "B1", boardRows: 2, boardCols: 2, stage: "live", startsAt: new Date("2026-01-01"), rulesMarkdown: "Published rules", createdByUserId: people.admin.id })
    .returning()
    .get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: people.player.id, rsn: "Player" }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.player.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: people.player.id, isCaptain: true }).run();
  // The Published board, made through the routes and published.
  tile = (await call("admin", "POST", "/admin/tiles", { name: "Vorkath", boardRow: 0, boardCol: 0 })).body.tile as typeof tile;
  task = (await call("admin", "POST", `/admin/tiles/${tile.id}/tasks`, { kind: "ITEM", label: "Head", points: 40, itemName: "Vorkath's head" })).body.task as typeof task;
  await publish();
});

async function publish() {
  const { preview } = (await call("admin", "GET", "/admin/board-draft/preview")).body as { preview: PublishPreview };
  return call("admin", "POST", "/admin/board-draft/publish", { revision: preview.revision });
}

async function makeDraft() {
  await call("admin", "PATCH", `/admin/tasks/${task.id}`, { kind: "ITEM", label: `Head ${SECRET}`, points: 60, itemName: "Vorkath's head" });
  await call("admin", "POST", "/admin/tiles", { name: `Tile ${SECRET}`, boardRow: 1, boardCol: 1 });
  await call("admin", "POST", "/admin/categories", { label: `Category ${SECRET}` });
  await call("admin", "PATCH", "/admin/board-draft/rules", { rulesMarkdown: `Rules ${SECRET}`, exclusivityRules: [{ id: "r", label: `Rule ${SECRET}`, itemNames: ["Vorkath's head"], scope: "tile" }] });
  db.update(schema.draftTiles).set({ imageUrl: `/uploads/tiles/${SECRET}.png` }).where(eq(schema.draftTiles.id, tile.id)).run();
}

describe("the read paths serve the Published board", () => {
  it("no Player- or Moderator-facing response contains draft content", async () => {
    await makeDraft();
    const reads: [Person, string][] = [
      ["player", ""],
      ["player", "/board"],
      ["player", `/teams/${team.id}/progress`],
      ["player", `/teams/${team.id}/submissions`],
      ["player", `/teams/${team.id}/activity`],
      ["player", "/stats"],
      ["mod", ""],
      ["mod", "/board"],
      ["mod", "/mod/submissions"],
      ["mod", "/mod/audit-log"],
    ];
    for (const [as, path] of reads) {
      const res = await call(as, "GET", path);
      expect(res.raw, `${as} GET ${path || "/"}`).not.toContain(SECRET);
    }
    const board = (await call("player", "GET", "/board")).body as { tiles: { name: string; node: { children: { points: number }[] } }[] };
    expect(board.tiles.map((t) => t.name)).toEqual(["Vorkath"]);
    expect(board.tiles[0]!.node.children[0]!.points).toBe(40);
    expect(((await call("player", "GET", "")).body.bingo as { rulesMarkdown: string }).rulesMarkdown).toBe("Published rules");
    // The export is the Published board too.
    expect((await call("admin", "GET", "/admin/export?images=0")).raw).not.toContain(SECRET);
  });

  it("while the Admins' editor shows the draft, with who changed it last", async () => {
    await makeDraft();
    const editor = (await call("admin", "GET", "/admin/board-draft")).body as unknown as DraftBoardResponse;
    expect(editor.board.tiles.map((t) => t.name)).toEqual(expect.arrayContaining(["Vorkath", `Tile ${SECRET}`]));
    expect(editor.rulesMarkdown).toBe(`Rules ${SECRET}`);
    expect(editor.categories.map((c) => c.label)).toEqual([`Category ${SECRET}`]);
    expect(editor.status).toMatchObject({ hasChanges: true, updatedBy: { id: people.admin.id } });
    // A Moderator can't reach the draft at all.
    expect((await call("mod", "GET", "/admin/board-draft")).status).toBe(403);
    expect((await call("mod", "GET", "/admin/board-draft/status")).status).toBe(403);
  });
});

describe("publishing over HTTP", () => {
  it("shows the draft to Players once published, and refuses a stale preview with the new diff to look at", async () => {
    await call("admin", "PATCH", `/admin/tasks/${task.id}`, { kind: "ITEM", label: "Head", points: 60, itemName: "Vorkath's head" });
    const { preview } = (await call("admin", "GET", "/admin/board-draft/preview")).body as { preview: PublishPreview };
    await call("admin", "PATCH", `/admin/tiles/${tile.id}/bonus-points`, { points: 5 });

    const stale = await call("admin", "POST", "/admin/board-draft/publish", { revision: preview.revision });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("stale_preview");

    expect((await publish()).status).toBe(200);
    const board = (await call("player", "GET", "/board")).body as { tiles: { node: { points: number; children: { points: number }[] } }[] };
    expect([board.tiles[0]!.node.points, board.tiles[0]!.node.children[0]!.points]).toEqual([5, 60]);
    const log = (await call("mod", "GET", "/mod/audit-log?action=board.published")).body as { entries: { label: string }[] };
    expect(log.entries[0]!.label).toBe("admin published the board (1 Tile changed)");
  });

  it("Discard leaves what Players see as it was", async () => {
    const before = (await call("player", "GET", "/board")).raw;
    await makeDraft();
    expect((await call("admin", "POST", "/admin/board-draft/discard")).status).toBe(204);
    expect((await call("player", "GET", "/board")).raw).toBe(before);
    expect(((await call("admin", "GET", "/admin/board-draft/status")).body.status as { hasChanges: boolean }).hasChanges).toBe(false);
    const log = (await call("mod", "GET", "/mod/audit-log?action=board.discarded")).body as { entries: { label: string }[] };
    expect(log.entries).toHaveLength(1);
  });
});

describe("settings", () => {
  it("sends the Rules text and Exclusive Item rules to the draft, and saves every other setting at once", async () => {
    const res = await call("admin", "PATCH", "/admin/settings", { name: "Renamed", rulesMarkdown: "Draft rules" });
    expect(res.status).toBe(200);
    const shell = (await call("player", "GET", "")).body.bingo as { name: string; rulesMarkdown: string };
    expect(shell).toMatchObject({ name: "Renamed", rulesMarkdown: "Published rules" });
    expect(((await call("admin", "GET", "/admin/board-draft")).body as unknown as DraftBoardResponse).rulesMarkdown).toBe("Draft rules");
  });
});

describe("stages", () => {
  it("edits the board through the draft in Planning just as in Live", async () => {
    db.update(schema.bingos).set({ stage: "planning" }).where(eq(schema.bingos.id, bingo.id)).run();
    await call("admin", "PATCH", `/admin/tiles/${tile.id}`, { name: "Renamed tile" });
    expect(((await call("mod", "GET", "/board")).body as { tiles: { name: string }[] }).tiles[0]!.name).toBe("Vorkath");
    expect((await publish()).status).toBe(200);
    expect(((await call("mod", "GET", "/board")).body as { tiles: { name: string }[] }).tiles[0]!.name).toBe("Renamed tile");
  });

  it("keeps a Finished Bingo's board locked", async () => {
    await call("admin", "PATCH", `/admin/tiles/${tile.id}`, { name: "Renamed tile" });
    db.update(schema.bingos).set({ stage: "complete" }).where(eq(schema.bingos.id, bingo.id)).run();
    expect((await call("admin", "PATCH", `/admin/tiles/${tile.id}`, { name: "Again" })).status).toBe(400);
    expect((await call("admin", "PATCH", "/admin/board-draft/rules", { rulesMarkdown: "x" })).status).toBe(400);
    const { preview } = (await call("admin", "GET", "/admin/board-draft/preview")).body as { preview: PublishPreview };
    expect((await call("admin", "POST", "/admin/board-draft/publish", { revision: preview.revision })).status).toBe(400);
  });

  it("refuses an edit to another Bingo's Tile", async () => {
    const other = db.insert(schema.bingos).values({ slug: "b2", name: "B2", boardRows: 1, boardCols: 1, createdByUserId: people.admin.id }).returning().get();
    const { createTile } = await import("../services/boardService");
    const theirs = createTile(db, { bingoId: other.id, name: "Theirs", boardRow: 0, boardCol: 0 });
    expect((await call("admin", "PATCH", `/admin/tiles/${theirs.id}`, { name: "Mine now" })).status).toBe(404);
  });
});
