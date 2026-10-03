// Tags (CONTEXT.md "Tag"), answered by the routes themselves: the bingos and admin routers over a real in-memory DB,
// with the logged-in user faked and the OSRS Wiki stubbed, hit over HTTP. Players never get tags, from any route; their
// search gets the matching Tiles' ids; only Admins read and edit tags.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BoardTagsResponse, Stage, Tag } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createTask, createTile } from "../services/boardService";
import { addTextTag } from "../services/tagService";

vi.mock("../ocr", () => ({ isOcrEnabled: () => false, analyzeSubmissionScreenshot: vi.fn() }));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});
// The wiki answers whatever the test sets here; "down" can't be reached.
const wiki = vi.hoisted(() => ({ reply: null as unknown }));
vi.mock("../services/osrsWikiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/osrsWikiService")>();
  const client = new actual.OsrsWikiClient((async () => {
    if (wiki.reply === "down") throw new Error("ECONNREFUSED");
    return new Response(JSON.stringify(wiki.reply), { status: 200 });
  }) as unknown as typeof fetch);
  return { ...actual, getOsrsWikiClient: () => client };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
type Person = "admin" | "mod" | "player";
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let vorkath: typeof schema.tiles.$inferSelect;
let zulrah: typeof schema.tiles.$inferSelect;
let partA: { id: string };
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
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use("/api/bingos", bingosRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos`;
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

function setStage(stage: Stage, extra: Partial<typeof schema.bingos.$inferInsert> = {}) {
  db.update(schema.bingos).set({ stage, ...extra }).where(eq(schema.bingos.id, bingo.id)).run();
}

async function call(as: Person, method: string, path: string, body?: unknown) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, text, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}
const get = (as: Person, path: string) => call(as, "GET", path);

const SECRET = "zqxsecret";

beforeEach(() => {
  wipe();
  wiki.reply = null;
  const user = (discordId: string, extra: Partial<SessionUser> = {}) => db.insert(schema.users).values({ discordId, discordUsername: discordId, ...extra }).returning().get();
  people = { admin: user("admin", { isAdmin: true }), mod: user("mod"), player: user("player") };
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 1, boardCols: 2, createdByUserId: people.admin.id, stage: "live" }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: people.player.id, rsn: "player" }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.player.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: people.player.id, isCaptain: true }).run();
  vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  partA = createTask(db, vorkath.id, { kind: "ITEM", label: "Part A", points: 10, itemName: "Vorki" }, 0);
  zulrah = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 1 });
  createTask(db, zulrah.id, { kind: "ITEM", label: "Part A", points: 10, itemName: "Tanzanite fang" }, 0);
  // Tags whose text is in no other field, so finding it in a response can only mean a tag leaked.
  addTextTag(db, bingo.id, { tileId: vorkath.id }, `${SECRET} tile`);
  addTextTag(db, bingo.id, { partId: partA.id }, `${SECRET} part`);
});

describe("Players never get tags", () => {
  const playerRoutes = () => [
    "/b1",
    "/b1/permissions",
    "/b1/board",
    "/b1/stats",
    "/b1/rewind",
    `/b1/teams/${team.id}/progress`,
    `/b1/teams/${team.id}/submissions`,
    `/b1/teams/${team.id}/activity`,
    "/b1/achievements",
    `/b1/players/${people.player.id}`,
    "/b1/draft",
    "/b1/tile-search?q=zqx",
  ];

  it("from the board, or any other route a Player reads, at every stage they can see the board", async () => {
    for (const stage of ["reveal", "live", "complete"] as const) {
      setStage(stage);
      for (const path of playerRoutes()) {
        const { text } = await get("player", path);
        expect(text, `${stage} ${path}`).not.toContain(SECRET);
      }
      // Not vacuous: the board itself is there, with its Tiles and Items.
      expect((await get("player", "/b1/board")).text).toContain("Vorki");
    }
  });

  it("nor from the admin routes, which are for Admins only", async () => {
    expect((await get("player", "/b1/admin/tags")).status).toBe(403);
    expect((await get("mod", "/b1/admin/tags")).status).toBe(403);
    expect((await call("player", "POST", `/b1/admin/tiles/${vorkath.id}/tags`, { text: "kq" })).status).toBe(403);
    expect((await get("player", "/b1/admin/bosses?q=vork")).status).toBe(403);
    const { status, body } = await get("admin", "/b1/admin/tags");
    expect(status).toBe(200);
    const tags = body as unknown as BoardTagsResponse;
    expect(tags.tiles[vorkath.id]!.map((t) => t.text)).toEqual([`${SECRET} tile`]);
    expect(tags.parts[partA.id]!.map((t) => t.text)).toEqual([`${SECRET} part`]);
  });
});

describe("the board's search by tag", () => {
  it("gives a Player the ids of the Tiles a query's tags match, on the Tile or one of its Parts", async () => {
    expect((await get("player", "/b1/tile-search?q=zqx")).body).toEqual({ tileIds: [vorkath.id] });
    expect((await get("player", "/b1/tile-search?q=PART")).body).toEqual({ tileIds: [vorkath.id] });
    expect((await get("player", "/b1/tile-search?q=fang")).body).toEqual({ tileIds: [] }); // an Item: the board finds that itself
    expect((await get("player", "/b1/tile-search?q=")).body).toEqual({ tileIds: [] });
  });

  it("finds nothing while the Tiles are sealed for the viewer, or before they can see the Tiles", async () => {
    setStage("reveal", { sealedTiles: true });
    expect((await get("player", "/b1/tile-search?q=zqx")).body).toEqual({ tileIds: [] });
    // Moderators can always open the Tiles, so their search keeps tags.
    expect((await get("mod", "/b1/tile-search?q=zqx")).body).toEqual({ tileIds: [vorkath.id] });
    setStage("reveal", { sealedTiles: false });
    expect((await get("player", "/b1/tile-search?q=zqx")).body).toEqual({ tileIds: [vorkath.id] });
    setStage("draft");
    expect((await get("player", "/b1/tile-search?q=zqx")).body).toEqual({ tileIds: [] });
  });
});

describe("the board editor", () => {
  const SIRE = { query: { pages: [{ title: "Abyssal Sire", redirects: [{ title: "Sire" }, { title: "Abyssal sire" }, { title: "Sire/Strategies" }], categories: [{ title: "Category:Bosses" }] }] } };

  it("adds and removes Text tags and Boss tags on a Tile or a Part", async () => {
    const added = await call("admin", "POST", `/b1/admin/tiles/${zulrah.id}/tags`, { text: " snek " });
    expect(added.status).toBe(201);
    expect((added.body.tags as Tag[]).map((t) => t.text)).toEqual(["snek"]);
    expect((await call("admin", "POST", `/b1/admin/tiles/${zulrah.id}/tags`, { text: "x".repeat(41) })).status).toBe(400);

    wiki.reply = SIRE;
    const boss = await call("admin", "POST", `/b1/admin/parts/${partA.id}/tags`, { boss: "Abyssal Sire" });
    expect(boss.status).toBe(201);
    const tags = boss.body.tags as Tag[];
    const bossTag = tags.find((t) => t.kind === "boss")!;
    expect(tags.filter((t) => t.bossTagId === bossTag.id).map((t) => t.text)).toEqual(["Sire"]);

    const removed = await call("admin", "DELETE", `/b1/admin/tags/${bossTag.id}`);
    expect((removed.body.tags as Tag[]).map((t) => t.text)).toEqual([`${SECRET} part`]);
  });

  it("says so, and adds nothing, when the wiki can't be reached", async () => {
    wiki.reply = "down";
    const { status, body } = await call("admin", "POST", `/b1/admin/tiles/${zulrah.id}/tags`, { boss: "Zulrah" });
    expect(status).toBe(502);
    expect(String(body.error)).toMatch(/Couldn't reach the OSRS Wiki/);
    expect(db.select().from(schema.tags).where(eq(schema.tags.tileId, zulrah.id)).all()).toEqual([]);
    expect((await get("admin", "/b1/admin/bosses?q=zul")).status).toBe(502);
  });

  it("searches the wiki's Bosses category for the boss picker", async () => {
    wiki.reply = { query: { categorymembers: [{ ns: 0, title: "Vorkath" }, { ns: 0, title: "Zulrah" }] } };
    expect((await get("admin", "/b1/admin/bosses?q=zul")).body).toEqual({ bosses: [{ name: "Zulrah", wikiUrl: "https://oldschool.runescape.wiki/w/Zulrah" }] });
  });

  it("can't change tags once the bingo is Finished", async () => {
    setStage("complete");
    expect((await call("admin", "POST", `/b1/admin/tiles/${zulrah.id}/tags`, { text: "snek" })).status).toBe(400);
  });
});
