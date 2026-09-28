import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { WRAPPED_ART_KEYING_DEFAULTS, maxWrappedArt } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createBingo, deleteBingo } from "./bingoService";
import { exportBingo, importBingoWithImages } from "./bingoExportService";
import { addArt, artSet, listArt, recutArt, removeArt, reorderArt, replaceArt, WRAPPED_ART_DIR } from "./wrappedArtService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let uploadsDir: string;
let adminId: string;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrapped-art-"));
  adminId = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get().id;
});
afterEach(() => {
  sqlite.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

const newBingo = (slug: string) => createBingo(db, { slug, name: slug, boardRows: 2, boardCols: 2, createdByUserId: adminId });

/** A dark block on a transparent canvas: already cut out. */
function transparentPng(): Promise<Buffer> {
  const block = { create: { width: 30, height: 50, channels: 4 as const, background: { r: 40, g: 30, b: 20, alpha: 1 } } };
  return sharp({ create: { width: 60, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { ...block }, left: 15, top: 15 }])
    .png()
    .toBuffer();
}

/** The same block on solid green, opaque: a Blindfold screenshot. */
function greenScreenshot(): Promise<Buffer> {
  const block = { create: { width: 30, height: 50, channels: 3 as const, background: { r: 40, g: 30, b: 20 } } };
  return sharp({ create: { width: 60, height: 80, channels: 3, background: { r: 0, g: 255, b: 0 } } })
    .composite([{ input: { ...block }, left: 15, top: 15 }])
    .png()
    .toBuffer();
}

const onDisk = (url: string) => fs.existsSync(path.join(uploadsDir, url.replace(/^\/uploads\//, "")));
const filesIn = () => (fs.existsSync(path.join(uploadsDir, WRAPPED_ART_DIR)) ? fs.readdirSync(path.join(uploadsDir, WRAPPED_ART_DIR)) : []);

describe("addArt", () => {
  it("renders a transparent PNG's two frames and keeps the original", async () => {
    const bingo = newBingo("b1");
    const art = await addArt(db, uploadsDir, bingo, "intro", await transparentPng());
    expect(art.group).toBe("intro");
    expect(art.keying).toBeNull();
    expect(art.keyColor).toBeNull();
    expect(onDisk(art.originalUrl)).toBe(true);
    for (const frame of art.frames) {
      expect(onDisk(frame)).toBe(true);
      expect((await sharp(path.join(uploadsDir, frame.replace(/^\/uploads\//, ""))).metadata()).format).toBe("webp");
    }
    expect(artSet(db, bingo.id)).toEqual({ sections: { intro: [art.frames] }, side: [] });
  });

  it("keys out a solid-background screenshot", async () => {
    const bingo = newBingo("b1");
    const art = await addArt(db, uploadsDir, bingo, "team", await greenScreenshot());
    expect(art.keyColor).toBe("#00ff00");
    expect(art.keying).toEqual(WRAPPED_ART_KEYING_DEFAULTS);
  });

  it("refuses an opaque image whose edge isn't one colour, and writes nothing", async () => {
    const bingo = newBingo("b1");
    const noisy = await sharp(Buffer.from(Array.from({ length: 60 * 60 * 3 }, (_, i) => (i * 97) % 256)), { raw: { width: 60, height: 60, channels: 3 } }).png().toBuffer();
    await expect(addArt(db, uploadsDir, bingo, "intro", noisy)).rejects.toThrow(/Blindfold/);
    expect(filesIn()).toEqual([]);
    expect(listArt(db, bingo.id)).toEqual([]);
  });

  it("refuses a file that isn't an image", async () => {
    const bingo = newBingo("b1");
    await expect(addArt(db, uploadsDir, bingo, "intro", Buffer.from("<svg></svg>"))).rejects.toBeInstanceOf(ServiceError);
  });

  it("adds several images to a group, in order, and the side pool separately", async () => {
    const bingo = newBingo("b1");
    const first = await addArt(db, uploadsDir, bingo, "team", await transparentPng());
    const second = await addArt(db, uploadsDir, bingo, "team", await greenScreenshot());
    const side = await addArt(db, uploadsDir, bingo, "side", await transparentPng());
    expect(artSet(db, bingo.id)).toEqual({ sections: { team: [first.frames, second.frames] }, side: [side.frames] });
  });

  it("stops at the most a group holds", async () => {
    const bingo = newBingo("b1");
    const png = await transparentPng();
    for (let i = 0; i < maxWrappedArt("duo"); i++) await addArt(db, uploadsDir, bingo, "duo", png);
    await expect(addArt(db, uploadsDir, bingo, "duo", png)).rejects.toThrow(/the most this group holds/);
  });
});

describe("replaceArt, recutArt, removeArt, reorderArt", () => {
  it("replaces one image in its place", async () => {
    const bingo = newBingo("b1");
    const a = await addArt(db, uploadsDir, bingo, "team", await transparentPng());
    const b = await addArt(db, uploadsDir, bingo, "team", await transparentPng());
    const replaced = await replaceArt(db, uploadsDir, bingo, a.id, await greenScreenshot());
    expect(replaced.id).toBe(a.id);
    expect(replaced.keyColor).toBe("#00ff00");
    expect(listArt(db, bingo.id).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it("re-cuts a stored screenshot with other keying settings, and refuses one uploaded already cut out", async () => {
    const bingo = newBingo("b1");
    const keyed = await addArt(db, uploadsDir, bingo, "you", await greenScreenshot());
    const recut = await recutArt(db, uploadsDir, bingo, keyed.id, { tolerance: 60, softness: 40 });
    expect(recut.keying).toEqual({ tolerance: 60, softness: 40 });
    expect(recut.originalUrl).toBe(keyed.originalUrl);
    expect(recut.frames).not.toEqual(keyed.frames);
    const cut = await addArt(db, uploadsDir, bingo, "you", await transparentPng());
    await expect(recutArt(db, uploadsDir, bingo, cut.id, WRAPPED_ART_KEYING_DEFAULTS)).rejects.toThrow(/already cut out/);
  });

  it("removes one image", async () => {
    const bingo = newBingo("b1");
    const a = await addArt(db, uploadsDir, bingo, "outro", await transparentPng());
    removeArt(db, bingo, a.id);
    expect(artSet(db, bingo.id)).toEqual({ sections: {}, side: [] });
    expect(() => removeArt(db, bingo, a.id)).toThrow(/No such/);
  });

  it("reorders a group, given exactly its images", async () => {
    const bingo = newBingo("b1");
    const [a, b, c] = [await addArt(db, uploadsDir, bingo, "side", await transparentPng()), await addArt(db, uploadsDir, bingo, "side", await transparentPng()), await addArt(db, uploadsDir, bingo, "side", await transparentPng())];
    expect(reorderArt(db, bingo, "side", [c!.id, a!.id, b!.id]).map((x) => x.id)).toEqual([c!.id, a!.id, b!.id]);
    expect(() => reorderArt(db, bingo, "side", [a!.id, b!.id])).toThrow(/every image/);
  });

  it("never touches another Bingo's image", async () => {
    const mine = newBingo("mine");
    const theirs = newBingo("theirs");
    const a = await addArt(db, uploadsDir, theirs, "intro", await transparentPng());
    expect(() => removeArt(db, mine, a.id)).toThrow(/No such/);
  });
});

describe("a new Bingo", () => {
  it("starts with a copy of the previous Bingo's art, in order, which it can change on its own", async () => {
    const previous = newBingo("spring");
    const a = await addArt(db, uploadsDir, previous, "team", await transparentPng());
    const b = await addArt(db, uploadsDir, previous, "team", await greenScreenshot());
    const side = await addArt(db, uploadsDir, previous, "side", await transparentPng());
    const next = newBingo("autumn");
    expect(artSet(db, next.id)).toEqual({ sections: { team: [a.frames, b.frames] }, side: [side.frames] });

    removeArt(db, next, listArt(db, next.id)[0]!.id);
    expect(artSet(db, previous.id).sections.team).toHaveLength(2);
    for (const frame of a.frames) expect(onDisk(frame)).toBe(true);
  });

  it("never copies from a generated test Bingo", async () => {
    const test = newBingo("testdata-qa");
    await addArt(db, uploadsDir, test, "intro", await transparentPng());
    expect(artSet(db, newBingo("real").id)).toEqual({ sections: {}, side: [] });
  });

  it("loses its art rows when deleted", async () => {
    const bingo = newBingo("b1");
    await addArt(db, uploadsDir, bingo, "intro", await transparentPng());
    deleteBingo(db, bingo.id);
    expect(db.select().from(schema.wrappedArt).all()).toEqual([]);
  });
});

describe("export and import", () => {
  it("carries each group's originals in order with their keying, and renders the frames again on import", async () => {
    const source = newBingo("source");
    await addArt(db, uploadsDir, source, "intro", await transparentPng());
    const team = await addArt(db, uploadsDir, source, "team", await greenScreenshot());
    await recutArt(db, uploadsDir, source, team.id, { tolerance: 50, softness: 90 });
    await addArt(db, uploadsDir, source, "team", await transparentPng());
    await addArt(db, uploadsDir, source, "side", await transparentPng());

    const doc = exportBingo(db, source.id, { uploadsDir });
    const expected = [
      ["intro", null],
      ["team", { tolerance: 50, softness: 90 }],
      ["team", null],
      ["side", null],
    ];
    expect(doc.wrappedArt?.map((a) => [a.section, a.keying])).toEqual(expected);
    expect(exportBingo(db, source.id).wrappedArt).toBeUndefined();

    // The new Bingo first copies the source's art; the document's groups replace it, not add to it.
    const imported = await importBingoWithImages(db, doc, { slug: "copy", createdByUserId: adminId }, uploadsDir);
    const art = listArt(db, imported.id);
    expect(art.map((a) => [a.group, a.keying])).toEqual(expected);
    for (const a of art) for (const url of [a.originalUrl, ...a.frames]) expect(onDisk(url)).toBe(true);
  });

  it("refuses Wrapped art for a group that doesn't exist", async () => {
    const source = newBingo("source");
    await addArt(db, uploadsDir, source, "intro", await transparentPng());
    const doc = exportBingo(db, source.id, { uploadsDir });
    doc.wrappedArt![0]!.section = "credits";
    await expect(importBingoWithImages(db, doc, { slug: "copy", createdByUserId: adminId }, uploadsDir)).rejects.toThrow(/unknown section/);
  });
});
