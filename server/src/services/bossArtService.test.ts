import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { maxWrappedArt } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createBingo } from "./bingoService";
import { addArt, listArt, WRAPPED_ART_DIR } from "./wrappedArtService";
import { addBoardBosses, boardBosses, bossOriginalName, bossOriginalUrl, imagePageOf } from "./bossArtService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let uploadsDir: string;
let adminId: string;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-art-"));
  adminId = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get().id;
});
afterEach(() => {
  sqlite.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

const newBingo = (slug: string) => createBingo(db, { slug, name: slug, boardRows: 2, boardCols: 2, createdByUserId: adminId });
const withItems = (bingoId: string, items: string[]) => {
  for (const itemName of items) db.insert(schema.nodes).values({ bingoId, kind: "ITEM", itemName }).run();
};

/** A monster on a transparent canvas, as a wiki render is. */
function render(): Promise<Buffer> {
  const body = { create: { width: 40, height: 70, channels: 4 as const, background: { r: 120, g: 30, b: 20, alpha: 1 } } };
  return sharp({ create: { width: 80, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: 20, top: 15 }])
    .png()
    .toBuffer();
}

/** The wiki: each page's image at /images/<page>.png, and what was asked of it. */
function fakeWiki(opts: { noImage?: string[] } = {}) {
  const asked: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/api.php") {
      const page = url.searchParams.get("titles")!;
      asked.push(page);
      const original = opts.noImage?.includes(page) ? {} : { original: { source: `https://wiki.test/images/${encodeURIComponent(page)}.png` } };
      return new Response(JSON.stringify({ query: { pages: { "1": { title: page, ...original } } } }));
    }
    return new Response(new Uint8Array(await render()));
  }) as typeof fetch;
  return { impl, asked };
}

describe("boardBosses", () => {
  it("lists the bosses that drop the Board's Items, the most Items first, then by name", () => {
    const bosses = boardBosses(["Vorki", "Dragonbone necklace", "Bandos chestplate", "Twisted bow", "Not an item"]);
    expect(bosses.map((b) => [b.page, b.items])).toEqual([
      ["Vorkath", 2],
      ["Great Olm", 1],
      ["General Graardor", 1],
    ]);
  });

  it("gives a raid's modes one image, its final boss", () => {
    expect(imagePageOf("chambers_of_xeric")).toBe("Great Olm");
    expect(imagePageOf("chambers_of_xeric_challenge_mode")).toBe("Great Olm");
    const pages = boardBosses(["Twisted bow"]).map((b) => b.page);
    expect(pages).toEqual(["Great Olm"]);
  });

  it("calls a boss by its drops' page otherwise", () => {
    expect(imagePageOf("vorkath")).toBe("Vorkath");
  });
});

describe("addBoardBosses", () => {
  it("adds each boss's wiki image to the end of the side images, the most Items first", async () => {
    const bingo = newBingo("b1");
    withItems(bingo.id, ["Bandos chestplate", "Vorki", "Dragonbone necklace"]);
    const wiki = fakeWiki();
    const result = await addBoardBosses(db, uploadsDir, bingo, wiki.impl);
    expect(result.added).toEqual(["Vorkath", "General Graardor"]);
    expect(result.skipped).toEqual([]);
    const side = listArt(db, bingo.id).filter((a) => a.group === "side");
    expect(side.map((a) => a.originalUrl)).toEqual([bossOriginalUrl("Vorkath"), bossOriginalUrl("General Graardor")]);
    expect(fs.existsSync(path.join(uploadsDir, WRAPPED_ART_DIR, bossOriginalName("Vorkath")))).toBe(true);
  });

  it("leaves out the bosses already in the pool, and asks the wiki for a boss only once per server", async () => {
    withItems(newBingo("b1").id, ["Vorki"]);
    const first = db.select().from(schema.bingos).all()[0]!;
    const wiki = fakeWiki();
    await addBoardBosses(db, uploadsDir, first, wiki.impl);
    await expect(addBoardBosses(db, uploadsDir, first, wiki.impl)).rejects.toThrow("already a side image");

    // A new Bingo starts with a copy of the last one's art: its Vorkath is recognised too.
    const second = newBingo("b2");
    withItems(second.id, ["Vorki"]);
    await expect(addBoardBosses(db, uploadsDir, second, wiki.impl)).rejects.toThrow("already a side image");
    db.delete(schema.wrappedArt).where(eq(schema.wrappedArt.bingoId, second.id)).run();
    expect((await addBoardBosses(db, uploadsDir, second, wiki.impl)).added).toEqual(["Vorkath"]);
    expect(wiki.asked).toEqual(["Vorkath"]);
  });

  it("adds as many as the pool has room for, and says which didn't fit", async () => {
    const bingo = newBingo("b1");
    for (let i = 0; i < maxWrappedArt("side") - 1; i++) await addArt(db, uploadsDir, bingo, "side", await render());
    withItems(bingo.id, ["Vorki", "Dragonbone necklace", "Bandos chestplate"]);
    const result = await addBoardBosses(db, uploadsDir, bingo, fakeWiki().impl);
    expect(result.added).toEqual(["Vorkath"]);
    expect(result.skipped).toEqual([{ name: "General Graardor", reason: `the side images are full (${maxWrappedArt("side")})` }]);
    // Eleven stickers rendered first: slow beside the rest of the suite.
  }, 30_000);

  it("skips a boss whose page has no image, and one the wiki fails on, adding the rest", async () => {
    const bingo = newBingo("b1");
    withItems(bingo.id, ["Vorki", "Bandos chestplate"]);
    const result = await addBoardBosses(db, uploadsDir, bingo, fakeWiki({ noImage: ["Vorkath"] }).impl);
    expect(result.added).toEqual(["General Graardor"]);
    expect(result.skipped).toEqual([{ name: "Vorkath", reason: "its wiki page has no image" }]);

    const failing = (async () => new Response("", { status: 503 })) as typeof fetch;
    const other = newBingo("b2");
    withItems(other.id, ["Vorki"]);
    expect((await addBoardBosses(db, uploadsDir, other, failing)).skipped).toEqual([{ name: "Vorkath", reason: "the OSRS Wiki didn't send its image" }]);
  });

  it("refuses a Board with no boss's Items on it", async () => {
    const bingo = newBingo("b1");
    withItems(bingo.id, ["Not an item"]);
    await expect(addBoardBosses(db, uploadsDir, bingo, fakeWiki().impl)).rejects.toBeInstanceOf(ServiceError);
  });

  it("logs one audit entry naming the bosses added", async () => {
    const bingo = newBingo("b1");
    withItems(bingo.id, ["Vorki"]);
    await addBoardBosses(db, uploadsDir, bingo, fakeWiki().impl);
    const entries = db.select().from(schema.auditLog).all().filter((e) => e.action === "wrapped.art_bosses_added");
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0]!.details)).toEqual({ bosses: ["Vorkath"] });
  });
});
