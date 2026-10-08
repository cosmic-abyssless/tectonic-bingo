// setup.ts's weighAnItem: the Counts as a run gives one Item after the import, sent back the way the board editor
// sends a Task, and written by the real board service to the Draft board; and publishBoard, which publishes it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BingoExportDocument, GraphNodeInput } from "@bingo/shared";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { eq } from "drizzle-orm";
import { createTask, createTile, getBoardForViewer, getBoardTiles, updateNode } from "../../services/boardService";
import { editDraft, getDraftStatus, getEditorBoard, getPublishPreview, publishDraft } from "../../services/boardDraftService";
import { DRAFT_BOARD } from "../../services/boardTables";
import { exportBingo, importBingo as realImport } from "../../services/bingoExportService";
import { getBoardTags } from "../../services/tagService";
import { goLive, importBingo, publishBoard, weighAnItem, type Ctx } from "./setup";

vi.mock("../../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

function seed() {
  const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get();
  const bingo = db.insert(schema.bingos).values({ slug: "testdata-w", name: "W", boardRows: 1, boardCols: 2, createdByUserId: admin.id }).returning().get();
  const vork = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  createTask(db, vork.id, { kind: "ITEM", label: "Head", points: 10, itemName: "Vorkath's head" }, 0);
  const wt = createTile(db, { bingoId: bingo.id, name: "Wintertodt", boardRow: 0, boardCol: 1 });
  const task = createTask(
    db,
    wt.id,
    { kind: "ALL", label: "Page 1", points: 40, children: [{ kind: "SUM", quantity: 200, children: [{ kind: "ITEM", itemName: "Burnt page" }, { kind: "ITEM", itemName: "Bruma torch", valuedAs: { itemName: "Tome of fire", divisor: 8 } }] }] },
    0,
  );
  return { bingo, task };
}

// A Ctx whose requests go straight to the board services, as the admin routes would.
function ctxFor(bingo: typeof schema.bingos.$inferSelect, log: string[]) {
  const patches: { path: string; body: GraphNodeInput }[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const session = {
    get: async (path: string) => {
      if (path.endsWith("/admin/board-draft")) return getEditorBoard(db, bingo.id);
      if (path.endsWith("/admin/board-draft/status")) return { status: getDraftStatus(db, bingo.id) };
      if (path.endsWith("/admin/board-draft/preview")) return { preview: getPublishPreview(db, bingo.id) };
      throw new Error(`unexpected GET ${path}`);
    },
    patch: async (path: string, body: GraphNodeInput) => {
      patches.push({ path, body });
      return { task: editDraft(db, bingo.id, null, (t) => updateNode(db, path.split("/").at(-1)!, body, t)) };
    },
    post: async (path: string, body: { revision: string }) => {
      posts.push({ path, body });
      if (!path.endsWith("/admin/board-draft/publish")) throw new Error(`unexpected POST ${path}`);
      return publishDraft(db, bingo, body.revision);
    },
  };
  const ctx = { api: { as: () => session }, slug: bingo.slug, admin: "admin", log: (m: string) => log.push(m) } as unknown as Ctx;
  return { ctx, patches, posts };
}

describe("weighAnItem", () => {
  it("gives the last Item of the first SUM a Counts as through the Task's PATCH, leaving the rest of the Task as it was", async () => {
    const { bingo, task } = seed();
    const log: string[] = [];
    const { ctx, patches } = ctxFor(bingo, log);
    await weighAnItem(ctx, new Date());

    expect(patches.map((p) => p.path)).toEqual([`/api/bingos/testdata-w/admin/tasks/${task.id}`]);
    // An edit in the board editor goes to the Draft board; the Published board is as imported until publishBoard.
    expect(getBoardTiles(db, bingo.id).find((t) => t.name === "Wintertodt")!.node.children[0]!.children[0]!.children.map((c) => c.countsAs)).toEqual([1, 1]);
    const after = getBoardTiles(db, bingo.id, DRAFT_BOARD).find((t) => t.name === "Wintertodt")!.node.children[0]!;
    const [sum] = after.children;
    expect(sum!.children.map((c) => [c.id, c.itemName, c.countsAs])).toEqual(task.children[0]!.children.map((c) => [c.id, c.itemName, c.itemName === "Bruma torch" ? 25 : 1]));
    expect(sum!.children[1]!.valuedAs).toMatchObject({ itemName: "Tome of fire", divisor: 8 });
    expect([after.label, after.points, sum!.quantity]).toEqual(["Page 1", 40, 200]);
    expect(log).toEqual(['Bruma torch counts as 25 in "Page 1"']);
  });

  it("leaves a board that already has one alone", async () => {
    const { bingo } = seed();
    const { ctx, patches } = ctxFor(bingo, []);
    await weighAnItem(ctx, new Date());
    await weighAnItem(ctx, new Date());
    expect(patches).toHaveLength(1);
  });
});

describe("publishBoard", () => {
  it("publishes the setup edits through the Publish endpoint, so the Bingo plays on them and its audit log shows it", async () => {
    const { bingo, task } = seed();
    const log: string[] = [];
    const { ctx, posts } = ctxFor(bingo, log);
    await weighAnItem(ctx, new Date());
    await publishBoard(ctx, new Date());

    expect(posts.map((p) => p.path)).toEqual(["/api/bingos/testdata-w/admin/board-draft/publish"]);
    const sum = getBoardTiles(db, bingo.id).find((t) => t.name === "Wintertodt")!.node.children[0]!.children[0]!;
    expect(sum.children.map((c) => [c.id, c.countsAs])).toEqual(task.children[0]!.children.map((c) => [c.id, c.itemName === "Bruma torch" ? 25 : 1]));
    expect(getDraftStatus(db, bingo.id).hasChanges).toBe(false);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "board.published")).all()).toHaveLength(1);
    expect(log.at(-1)).toMatch(/^published the board \(1 Tile changed\)/);
  });

  it("publishes nothing when the setup made no board edits", async () => {
    const { bingo } = seed();
    const { ctx, posts } = ctxFor(bingo, []);
    await publishBoard(ctx, new Date());
    expect(posts).toHaveLength(0);
  });
});

describe("importBingo", () => {
  // The import copies the board's source theme; the run's own theme is set with the dates, through the settings endpoint.
  it("sets the theme the run was asked for, in the same settings request as the dates", async () => {
    const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
    const session = {
      post: async (path: string, body: Record<string, unknown>) => void calls.push({ method: "POST", path, body }),
      patch: async (path: string, body: Record<string, unknown>) => void calls.push({ method: "PATCH", path, body }),
    };
    const at = new Date("2026-09-19T12:00:00Z");
    const tl = { now: new Date(at.getTime() - 60_000), createdAt: at, signupOpensAt: at, draftAt: at, revealAt: at, startsAt: at, endsAt: at } as Ctx["tl"];
    const ctx = { api: { as: () => session }, slug: "testdata-t", admin: "admin", tl, log: () => {} } as unknown as Ctx;

    await importBingo(ctx, { bingo: {} } as never, "Test data t", "comic");

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/admin/bingos/import", "PATCH /api/bingos/testdata-t/admin/settings"]);
    expect(calls[1]!.body).toMatchObject({ theme: "comic", startsAt: at.toISOString(), discordEnabled: true });
    expect(calls[1]!.body.discordChannels).toContainEqual({ key: "loot", type: "text", name: "{team}-loot" });

    // Asked for none, it leaves the theme the import copied from the board alone.
    calls.length = 0;
    await importBingo(ctx, { bingo: {} } as never, "Test data t", null);
    expect(calls[1]!.body).not.toHaveProperty("theme");
    expect(calls[1]!.body).not.toHaveProperty("discordGuildId");

    // A test Discord server goes in the same settings request.
    calls.length = 0;
    await importBingo(ctx, { bingo: {} } as never, "Test data t", null, "700000000000000000");
    expect(calls[1]!.body).toMatchObject({ discordGuildId: "700000000000000000", discordEnabled: true });
    expect(calls[1]!.body).toMatchObject({ startsAt: at.toISOString() });
  });

  // Set, a start date already past would make the server put the Bingo Live by itself (bingoStartService.ts) at the real
  // now, partway through the run's Board revealed: the run sets it as it goes Live instead.
  it("holds back a start date already past until the run goes Live, then sets it", async () => {
    const calls: { method: string; path: string; body: Record<string, unknown>; at?: Date }[] = [];
    const session = {
      post: async (path: string, body: Record<string, unknown>, opts?: { at?: Date }) => void calls.push({ method: "POST", path, body, at: opts?.at }),
      patch: async (path: string, body: Record<string, unknown>, opts?: { at?: Date }) => void calls.push({ method: "PATCH", path, body, at: opts?.at }),
    };
    const at = new Date("2026-09-19T12:00:00Z");
    const tl = { now: new Date(at.getTime() + 60_000), createdAt: at, signupOpensAt: at, draftAt: at, revealAt: at, startsAt: at, endsAt: at } as Ctx["tl"];
    const ctx = { api: { as: () => session }, slug: "testdata-t", admin: "admin", tl, log: () => {} } as unknown as Ctx;

    await importBingo(ctx, { bingo: {} } as never, "Test data t", null);
    expect(calls[1]!.body).not.toHaveProperty("startsAt");

    calls.length = 0;
    await goLive(ctx);
    expect(calls).toEqual([
      { method: "POST", path: "/api/bingos/testdata-t/mod/stage", body: { toStage: "live" }, at },
      { method: "PATCH", path: "/api/bingos/testdata-t/admin/settings", body: { startsAt: at.toISOString() }, at },
    ]);
  });
});

// Tags (CONTEXT.md "Tag"): a run adds none of its own. The generated Bingo has exactly its board's, which the import
// carries, and the wiki is never asked.
describe("tags", () => {
  it("come across from the board unchanged, and nothing asks the wiki", async () => {
    const { bingo, task } = seed();
    const vork = getBoardTiles(db, bingo.id).find((t) => t.name === "Vorkath")!;
    db.insert(schema.tags).values({ bingoId: bingo.id, tileId: vork.id, kind: "text", text: "vork", sortOrder: 0 }).run();
    const boss = db.insert(schema.tags).values({ bingoId: bingo.id, nodeId: task.id, kind: "boss", text: "Wintertodt", sortOrder: 0 }).returning().get();
    db.insert(schema.tags).values({ bingoId: bingo.id, nodeId: task.id, kind: "text", text: "WT", bossTagId: boss.id, sortOrder: 1 }).run();
    const document = exportBingo(db, bingo.id);

    const session = {
      post: async (_path: string, body: { slug: string; name: string; document: BingoExportDocument }) => ({ bingo: realImport(db, body.document, { slug: body.slug, name: body.name, createdByUserId: bingo.createdByUserId }) }),
      patch: async () => ({}),
    };
    const at = new Date("2026-09-19T12:00:00Z");
    const tl = { now: new Date(at.getTime() - 60_000), createdAt: at, signupOpensAt: at, draftAt: at, revealAt: at, startsAt: at, endsAt: at } as Ctx["tl"];
    const ctx = { api: { as: () => session }, slug: "testdata-tags", admin: "admin", tl, log: () => {} } as unknown as Ctx;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await importBingo(ctx, document, "Test data tags", null);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const generated = db.select().from(schema.bingos).all().find((b) => b.slug === "testdata-tags")!;
    expect(exportBingo(db, generated.id).tiles.map((t) => [t.tags, t.tasks.map((x) => x.tags)])).toEqual(document.tiles.map((t) => [t.tags, t.tasks.map((x) => x.tags)]));
    expect(getBoardTags(db, generated.id).tiles).not.toEqual({});
  });
});
