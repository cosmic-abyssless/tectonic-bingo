// setup.ts's weighAnItem and groupSomeItems: the Counts as and the "any one of" group a run gives the board after the
// import, sent back the way the board editor sends a Task, and written by the real board service.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createTask, createTile, getBoardForViewer, getBoardTiles, updateNode } from "../../services/boardService";
import { groupSomeItems, importBingo, weighAnItem, type Ctx } from "./setup";

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

// A Ctx whose requests go straight to the board service, as the routes would.
function ctxFor(bingo: typeof schema.bingos.$inferSelect, log: string[]) {
  const patches: { path: string; body: GraphNodeInput }[] = [];
  const session = {
    get: async () => getBoardForViewer(db, bingo, true),
    patch: async (path: string, body: GraphNodeInput) => {
      patches.push({ path, body });
      return { task: updateNode(db, path.split("/").at(-1)!, body) };
    },
  };
  const ctx = { api: { as: () => session }, slug: bingo.slug, admin: "admin", log: (m: string) => log.push(m) } as unknown as Ctx;
  return { ctx, patches };
}

describe("weighAnItem", () => {
  it("gives the last Item of the first SUM a Counts as through the Task's PATCH, leaving the rest of the Task as it was", async () => {
    const { bingo, task } = seed();
    const log: string[] = [];
    const { ctx, patches } = ctxFor(bingo, log);
    await weighAnItem(ctx, new Date());

    expect(patches.map((p) => p.path)).toEqual([`/api/bingos/testdata-w/admin/tasks/${task.id}`]);
    const after = getBoardTiles(db, bingo.id).find((t) => t.name === "Wintertodt")!.node.children[0]!;
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

describe("groupSomeItems", () => {
  function seedUniques() {
    const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get();
    const bingo = db.insert(schema.bingos).values({ slug: "testdata-g", name: "G", boardRows: 1, boardCols: 1, createdByUserId: admin.id }).returning().get();
    const tile = createTile(db, { bingoId: bingo.id, name: "Slayer bosses", boardRow: 0, boardCol: 0 });
    const names = ["Bludgeon axon", "Bludgeon claw", "Bludgeon spine", "Abyssal dagger", "Abyssal whip"];
    const task = createTask(db, tile.id, { kind: "SUM", label: "Page 1", points: 40, quantity: 4, children: names.map((itemName): GraphNodeInput => ({ kind: "ITEM", itemName })) }, 0);
    return { bingo, task };
  }

  it("puts the first three Items of the first SUM in an \"any one of\" group through the Task's PATCH, keeping their ids", async () => {
    const { bingo, task } = seedUniques();
    const log: string[] = [];
    const { ctx, patches } = ctxFor(bingo, log);
    await groupSomeItems(ctx, new Date());

    expect(patches.map((p) => p.path)).toEqual([`/api/bingos/testdata-g/admin/tasks/${task.id}`]);
    const after = getBoardTiles(db, bingo.id)[0]!.node.children[0]!;
    expect(after.children.map((c) => [c.kind, c.label ?? c.itemName])).toEqual([["ANY", "Counted once"], ["ITEM", "Abyssal dagger"], ["ITEM", "Abyssal whip"]]);
    expect(after.children[0]!.children.map((c) => c.id)).toEqual(task.children.slice(0, 3).map((c) => c.id));
    expect([after.label, after.points, after.quantity]).toEqual(["Page 1", 40, 4]);
    expect(log).toEqual(['Bludgeon axon, Bludgeon claw, Bludgeon spine count once together in "Page 1"']);
  });

  it("leaves a board that already has one alone", async () => {
    const { bingo } = seedUniques();
    const { ctx, patches } = ctxFor(bingo, []);
    await groupSomeItems(ctx, new Date());
    await groupSomeItems(ctx, new Date());
    expect(patches).toHaveLength(1);
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
  });
});
