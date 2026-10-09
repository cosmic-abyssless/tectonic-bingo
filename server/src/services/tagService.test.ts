import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile, deleteTask, deleteTile } from "./boardService";
import { deleteBingo } from "./bingoService";
import { OsrsWikiClient } from "./osrsWikiService";
import { addBossTag, addTextTag, getBoardTags, removeTag, tileSearchTags } from "./tagService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

function seed() {
  const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  const bingo = db.insert(schema.bingos).values({ slug: "b", name: "B", boardRows: 2, boardCols: 2, createdByUserId: admin.id }).returning().get();
  const kq = createTile(db, { bingoId: bingo.id, name: "Kalphite Queen", boardRow: 0, boardCol: 0 });
  const sire = createTile(db, { bingoId: bingo.id, name: "Sire", boardRow: 0, boardCol: 1 });
  const partA = createTask(db, sire.id, { kind: "ITEM", label: "Part A", points: 10, itemName: "Unsired" }, 0);
  const partB = createTask(db, sire.id, { kind: "ALL", label: "Part B", points: 20, children: [{ kind: "ITEM", itemName: "Abyssal bludgeon" }] }, 1);
  return { admin, bingo, kq, sire, partA, partB };
}

// The wiki answering one boss page's redirects (prop=redirects|categories), as it does for Abyssal Sire.
function wikiWith(page: { title: string; redirects: string[]; boss?: boolean } | "missing" | "down") {
  const fetchImpl = vi.fn(async () => {
    if (page === "down") throw new Error("ECONNREFUSED");
    const body =
      page === "missing"
        ? { query: { pages: [{ ns: 0, title: "Nope", missing: true }] } }
        : { query: { pages: [{ ns: 0, title: page.title, redirects: page.redirects.map((title) => ({ ns: 0, title })), ...(page.boss === false ? {} : { categories: [{ ns: 14, title: "Category:Bosses" }] }) }] } };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { wiki: new OsrsWikiClient(fetchImpl), fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn> };
}

const SIRE = { title: "Abyssal Sire", redirects: ["Abyssal sire", "Sire", "Abby sire", "SIRE", "Abbysal sire", "Money making guide/Abyssal Sire", "Abby Sire"] };

describe("Text tags", () => {
  it("are trimmed", () => {
    const { bingo, kq } = seed();
    expect(addTextTag(db, bingo.id, { tileId: kq.id }, "  kq  ").map((t) => t.text)).toEqual(["kq"]);
  });

  it("are refused over 40 characters, or empty", () => {
    const { bingo, kq } = seed();
    expect(() => addTextTag(db, bingo.id, { tileId: kq.id }, "x".repeat(41))).toThrow(/at most 40/);
    expect(() => addTextTag(db, bingo.id, { tileId: kq.id }, "   ")).toThrow(ServiceError);
    expect(addTextTag(db, bingo.id, { tileId: kq.id }, "x".repeat(40))).toHaveLength(1);
  });

  it("aren't added twice to the same Tile or Part, whatever the capitals", () => {
    const { bingo, kq, partA } = seed();
    addTextTag(db, bingo.id, { tileId: kq.id }, "kq");
    expect(addTextTag(db, bingo.id, { tileId: kq.id }, "KQ").map((t) => t.text)).toEqual(["kq"]);
    // A Part is its own place: the same word there is a tag of its own.
    expect(addTextTag(db, bingo.id, { partId: partA.id }, "Kq").map((t) => t.text)).toEqual(["Kq"]);
  });

  it("go only on this bingo's Tiles, and on Parts (a Tile's direct children), not deeper Tasks", () => {
    const { bingo, partB } = seed();
    const other = db.insert(schema.bingos).values({ slug: "other", name: "O", boardRows: 1, boardCols: 1, createdByUserId: db.select().from(schema.users).get()!.id }).returning().get();
    const otherTile = createTile(db, { bingoId: other.id, name: "Elsewhere", boardRow: 0, boardCol: 0 });
    expect(() => addTextTag(db, bingo.id, { tileId: otherTile.id }, "kq")).toThrow(/Tile not found/);
    expect(() => addTextTag(db, bingo.id, { partId: partB.children[0]!.id }, "kq")).toThrow(/Part not found/);
  });

  it("are listed for the editor by Tile and by Part, in the order they were added", () => {
    const { bingo, kq, partA } = seed();
    addTextTag(db, bingo.id, { tileId: kq.id }, "kq");
    addTextTag(db, bingo.id, { tileId: kq.id }, "queen");
    addTextTag(db, bingo.id, { partId: partA.id }, "unsired");
    const tags = getBoardTags(db, bingo.id);
    expect(tags.tiles[kq.id]!.map((t) => t.text)).toEqual(["kq", "queen"]);
    expect(tags.parts[partA.id]!.map((t) => [t.kind, t.text, t.bossTagId])).toEqual([["text", "unsired", null]]);
  });
});

describe("Boss tags", () => {
  it("add the wiki's names for the boss as Text tags marked with it, without subpages or case duplicates", async () => {
    const { bingo, sire } = seed();
    const { wiki } = wikiWith(SIRE);
    const tags = await addBossTag(db, bingo.id, { tileId: sire.id }, "Abyssal Sire", wiki);
    const boss = tags.find((t) => t.kind === "boss")!;
    expect(boss.text).toBe("Abyssal Sire");
    const aliases = tags.filter((t) => t.bossTagId === boss.id);
    // "Abyssal sire" is the boss's own name in other capitals, "SIRE" and "Abby Sire" repeat earlier names, and the
    // money making guide is a subpage.
    expect(aliases.map((t) => [t.kind, t.text])).toEqual([
      ["text", "Sire"],
      ["text", "Abby sire"],
      ["text", "Abbysal sire"],
    ]);
  });

  it("skip names the Tile already has, and a boss it already has is ignored without asking the wiki again", async () => {
    const { bingo, sire } = seed();
    addTextTag(db, bingo.id, { tileId: sire.id }, "sire");
    const { wiki, fetchImpl } = wikiWith(SIRE);
    await addBossTag(db, bingo.id, { tileId: sire.id }, "Abyssal Sire", wiki);
    const again = await addBossTag(db, bingo.id, { tileId: sire.id }, "abyssal sire", wiki);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(again.map((t) => t.text)).toEqual(["sire", "Abyssal Sire", "Abby sire", "Abbysal sire"]);
    expect(again.find((t) => t.text === "sire")!.bossTagId).toBeNull();
  });

  it("can lose one alias and keep the rest; removing the Boss tag removes the aliases it added", async () => {
    const { bingo, sire, partA } = seed();
    addTextTag(db, bingo.id, { partId: partA.id }, "unsired");
    const tags = await addBossTag(db, bingo.id, { partId: partA.id }, "Abyssal Sire", wikiWith(SIRE).wiki);
    const afterOne = removeTag(db, bingo.id, tags.find((t) => t.text === "Abby sire")!.id);
    expect(afterOne.map((t) => t.text)).toEqual(["unsired", "Abyssal Sire", "Sire", "Abbysal sire"]);

    const afterBoss = removeTag(db, bingo.id, afterOne.find((t) => t.kind === "boss")!.id);
    expect(afterBoss.map((t) => t.text)).toEqual(["unsired"]);
    expect(db.select().from(schema.tags).all()).toHaveLength(1);
  });

  it("fail with a readable message when the wiki can't be reached, adding nothing", async () => {
    const { bingo, sire } = seed();
    const err = await addBossTag(db, bingo.id, { tileId: sire.id }, "Abyssal Sire", wikiWith("down").wiki).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).status).toBe(502);
    expect((err as ServiceError).message).toMatch(/Couldn't reach the OSRS Wiki/);
    expect(db.select().from(schema.tags).all()).toEqual([]);
  });

  it("are refused for a page that doesn't exist or isn't a boss", async () => {
    const { bingo, sire } = seed();
    await expect(addBossTag(db, bingo.id, { tileId: sire.id }, "Nope", wikiWith("missing").wiki)).rejects.toThrow(/isn't a boss/);
    await expect(addBossTag(db, bingo.id, { tileId: sire.id }, "Abyssal whip", wikiWith({ title: "Abyssal whip", redirects: [], boss: false }).wiki)).rejects.toThrow(/isn't a boss/);
    expect(db.select().from(schema.tags).all()).toEqual([]);
  });
});

describe("tileSearchTags (what the board's search matches)", () => {
  it("gives each Tile its own tags and its Parts' tags, Boss tags' aliases included, and leaves out Tiles without any", async () => {
    const { bingo, kq, sire, partB } = seed();
    addTextTag(db, bingo.id, { tileId: kq.id }, "kq");
    await addBossTag(db, bingo.id, { partId: partB.id }, "Abyssal Sire", wikiWith(SIRE).wiki);
    const byTile = tileSearchTags(db, bingo.id);
    expect(byTile[kq.id]).toEqual(["kq"]);
    expect(byTile[sire.id]).toEqual(expect.arrayContaining(["Abyssal Sire", "Sire", "Abbysal sire"]));
    expect(Object.keys(byTile).sort()).toEqual([kq.id, sire.id].sort());
  });
});

describe("tags go with what they're on", () => {
  it("a Part's when the Part is deleted, a Tile's when the Tile is, all of them with the bingo", () => {
    const { bingo, kq, sire, partA, partB } = seed();
    addTextTag(db, bingo.id, { partId: partA.id }, "a");
    addTextTag(db, bingo.id, { partId: partB.id }, "b");
    addTextTag(db, bingo.id, { tileId: sire.id }, "sire");
    addTextTag(db, bingo.id, { tileId: kq.id }, "kq");
    deleteTask(db, partA.id);
    expect(db.select({ text: schema.tags.text }).from(schema.tags).all().map((t) => t.text).sort()).toEqual(["b", "kq", "sire"]);
    deleteTile(db, sire.id);
    expect(db.select({ text: schema.tags.text }).from(schema.tags).all().map((t) => t.text)).toEqual(["kq"]);
    deleteBingo(db, bingo.id);
    expect(db.select().from(schema.tags).where(eq(schema.tags.bingoId, bingo.id)).all()).toEqual([]);
  });
});

describe("the audit log", () => {
  it("records each tag added and removed, a Boss tag with how many names came with it", async () => {
    const { bingo, sire, partA } = seed();
    addTextTag(db, bingo.id, { tileId: sire.id }, "sire");
    const tags = await addBossTag(db, bingo.id, { partId: partA.id }, "Abyssal Sire", wikiWith(SIRE).wiki);
    removeTag(db, bingo.id, tags.find((t) => t.kind === "boss")!.id);
    const rows = db.select().from(schema.auditLog).all().filter((r) => r.action.startsWith("tag."));
    expect(rows.map((r) => [r.action, JSON.parse(r.details)])).toEqual([
      ["tag.added", { tileName: "Sire", partLabel: null, kind: "text", text: "sire" }],
      ["tag.added", { tileName: "Sire", partLabel: "Part A", kind: "boss", text: "Abyssal Sire", aliases: 3 }],
      ["tag.removed", { tileName: "Sire", partLabel: "Part A", kind: "boss", text: "Abyssal Sire", aliases: 3 }],
    ]);
  });
});
