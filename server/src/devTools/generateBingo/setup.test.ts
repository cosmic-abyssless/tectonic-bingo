// setup.ts's weighAnItem: the Counts as a run gives one Item after the import, sent back the way the board editor
// sends a Task, and written by the real board service to the Draft board; and publishBoard, which publishes it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { eq } from "drizzle-orm";
import { createTask, createTile, getBoardTiles, updateNode } from "../../services/boardService";
import { editDraft, getDraftStatus, getEditorBoard, getPublishPreview, publishDraft } from "../../services/boardDraftService";
import { DRAFT_BOARD } from "../../services/boardTables";
import { importBingo, publishBoard, weighAnItem, type Ctx } from "./setup";

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
    const tl = { createdAt: at, signupOpensAt: at, draftAt: at, revealAt: at, startsAt: at, endsAt: at } as Ctx["tl"];
    const ctx = { api: { as: () => session }, slug: "testdata-t", admin: "admin", tl, log: () => {} } as unknown as Ctx;

    await importBingo(ctx, { bingo: {} } as never, "Test data t", "comic");

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/admin/bingos/import", "PATCH /api/bingos/testdata-t/admin/settings"]);
    expect(calls[1]!.body).toMatchObject({ theme: "comic", startsAt: at.toISOString() });

    // Asked for none, it leaves the theme the import copied from the board alone.
    calls.length = 0;
    await importBingo(ctx, { bingo: {} } as never, "Test data t", null);
    expect(calls[1]!.body).not.toHaveProperty("theme");
    expect(calls[1]!.body).toMatchObject({ startsAt: at.toISOString() });
  });
});
