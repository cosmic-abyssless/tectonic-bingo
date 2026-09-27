import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { WRAPPED_ART_KEYING_DEFAULTS } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createBingo, deleteBingo } from "./bingoService";
import { exportBingo, importBingoWithImages } from "./bingoExportService";
import { artSet, listArt, recutArt, removeArt, uploadArt, WRAPPED_ART_DIR } from "./wrappedArtService";
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

describe("uploadArt", () => {
  it("renders a transparent PNG's two frames and keeps the original", async () => {
    const bingo = newBingo("b1");
    const slot = await uploadArt(db, uploadsDir, bingo, "intro", await transparentPng());
    expect(slot.keying).toBeNull();
    expect(slot.keyColor).toBeNull();
    expect(onDisk(slot.originalUrl)).toBe(true);
    for (const frame of slot.frames) {
      expect(onDisk(frame)).toBe(true);
      expect((await sharp(path.join(uploadsDir, frame.replace(/^\/uploads\//, ""))).metadata()).format).toBe("webp");
    }
    expect(artSet(db, bingo.id)).toEqual({ intro: slot.frames });
  });

  it("keys out a solid-background screenshot", async () => {
    const bingo = newBingo("b1");
    const slot = await uploadArt(db, uploadsDir, bingo, "team", await greenScreenshot());
    expect(slot.keyColor).toBe("#00ff00");
    expect(slot.keying).toEqual(WRAPPED_ART_KEYING_DEFAULTS);
  });

  it("refuses an opaque image whose edge isn't one colour, and writes nothing", async () => {
    const bingo = newBingo("b1");
    const noisy = await sharp(Buffer.from(Array.from({ length: 60 * 60 * 3 }, (_, i) => (i * 97) % 256)), { raw: { width: 60, height: 60, channels: 3 } }).png().toBuffer();
    await expect(uploadArt(db, uploadsDir, bingo, "intro", noisy)).rejects.toThrow(/Blindfold/);
    expect(filesIn()).toEqual([]);
    expect(listArt(db, bingo.id)).toEqual([]);
  });

  it("refuses a file that isn't an image", async () => {
    const bingo = newBingo("b1");
    await expect(uploadArt(db, uploadsDir, bingo, "intro", Buffer.from("<svg></svg>"))).rejects.toBeInstanceOf(ServiceError);
  });

  it("replaces a section's art", async () => {
    const bingo = newBingo("b1");
    const first = await uploadArt(db, uploadsDir, bingo, "intro", await transparentPng());
    const second = await uploadArt(db, uploadsDir, bingo, "intro", await greenScreenshot());
    expect(second.frames).not.toEqual(first.frames);
    expect(listArt(db, bingo.id)).toHaveLength(1);
  });
});

describe("recutArt", () => {
  it("renders the stored screenshot again with other keying settings", async () => {
    const bingo = newBingo("b1");
    const slot = await uploadArt(db, uploadsDir, bingo, "you", await greenScreenshot());
    const recut = await recutArt(db, uploadsDir, bingo, "you", { tolerance: 60, softness: 40 });
    expect(recut.keying).toEqual({ tolerance: 60, softness: 40 });
    expect(recut.originalUrl).toBe(slot.originalUrl);
    expect(recut.frames).not.toEqual(slot.frames);
  });

  it("refuses art that was uploaded already cut out", async () => {
    const bingo = newBingo("b1");
    await uploadArt(db, uploadsDir, bingo, "you", await transparentPng());
    await expect(recutArt(db, uploadsDir, bingo, "you", WRAPPED_ART_KEYING_DEFAULTS)).rejects.toThrow(/already cut out/);
  });
});

describe("removeArt", () => {
  it("removes a section's art", async () => {
    const bingo = newBingo("b1");
    await uploadArt(db, uploadsDir, bingo, "outro", await transparentPng());
    removeArt(db, bingo, "outro");
    expect(artSet(db, bingo.id)).toEqual({});
    expect(() => removeArt(db, bingo, "outro")).toThrow(/no art/);
  });
});

describe("a new Bingo", () => {
  it("starts with a copy of the previous Bingo's art, which it can change on its own", async () => {
    const previous = newBingo("spring");
    const slot = await uploadArt(db, uploadsDir, previous, "intro", await transparentPng());
    const next = newBingo("autumn");
    expect(artSet(db, next.id)).toEqual({ intro: slot.frames });

    removeArt(db, next, "intro");
    expect(artSet(db, previous.id)).toEqual({ intro: slot.frames });
    for (const frame of slot.frames) expect(onDisk(frame)).toBe(true);
  });

  it("never copies from a generated test Bingo", async () => {
    const test = newBingo("testdata-qa");
    await uploadArt(db, uploadsDir, test, "intro", await transparentPng());
    expect(artSet(db, newBingo("real").id)).toEqual({});
  });

  it("loses its art rows when deleted", async () => {
    const bingo = newBingo("b1");
    await uploadArt(db, uploadsDir, bingo, "intro", await transparentPng());
    deleteBingo(db, bingo.id);
    expect(db.select().from(schema.wrappedArt).all()).toEqual([]);
  });
});

describe("export and import", () => {
  it("carries the originals and keying, and renders the frames again on import", async () => {
    const source = newBingo("source");
    await uploadArt(db, uploadsDir, source, "intro", await transparentPng());
    await uploadArt(db, uploadsDir, source, "team", await greenScreenshot());
    await recutArt(db, uploadsDir, source, "team", { tolerance: 50, softness: 90 });

    const doc = exportBingo(db, source.id, { uploadsDir });
    expect(doc.wrappedArt?.map((a) => [a.section, a.keying])).toEqual([
      ["intro", null],
      ["team", { tolerance: 50, softness: 90 }],
    ]);
    expect(exportBingo(db, source.id).wrappedArt).toBeUndefined();

    // Somewhere else: the art is gone from the source, so only the document can bring it.
    removeArt(db, source, "intro");
    removeArt(db, source, "team");
    const imported = await importBingoWithImages(db, doc, { slug: "copy", createdByUserId: adminId }, uploadsDir);
    const art = listArt(db, imported.id);
    expect(art.map((a) => [a.section, a.keying])).toEqual([
      ["intro", null],
      ["team", { tolerance: 50, softness: 90 }],
    ]);
    for (const a of art) for (const url of [a.originalUrl, ...a.frames]) expect(onDisk(url)).toBe(true);
  });

  it("refuses Wrapped art for a section that doesn't exist", async () => {
    const source = newBingo("source");
    await uploadArt(db, uploadsDir, source, "intro", await transparentPng());
    const doc = exportBingo(db, source.id, { uploadsDir });
    doc.wrappedArt![0]!.section = "credits";
    await expect(importBingoWithImages(db, doc, { slug: "copy", createdByUserId: adminId }, uploadsDir)).rejects.toThrow(/unknown section/);
  });
});
