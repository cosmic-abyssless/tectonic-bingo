// The screenshot a DM about one drop carries: the Submission's main screenshot, downsized, read only from the uploads
// directory.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { UPLOADS_DIR } from "../config";
import { dmScreenshot, uploadPath, DM_IMAGE_MAX_WIDTH } from "./dmScreenshot";

// A temporary uploads directory, made by the mock (it runs before this file's imports).
vi.mock("../config", async (importOriginal) => {
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  return { ...(await importOriginal<typeof import("../config")>()), UPLOADS_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "dm-shot-")) };
});

const dir = UPLOADS_DIR;

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterAll(() => {
  sqlite.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function png(name: string, width: number) {
  await sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: "#806040" } }).png().toFile(path.join(dir, name));
  return `/uploads/${name}`;
}

function submissionWith(shots: { type: "main" | "proof" | "bank"; url: string }[]) {
  const user = db.insert(schema.users).values({ discordId: `d-${Math.random()}`, discordUsername: "u" }).returning().get();
  const bingo = db.insert(schema.bingos).values({ slug: `b-${Math.random()}`, name: "B", boardRows: 1, boardCols: 1, createdByUserId: user.id }).returning().get();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: user.id, name: "T", codeword: `c-${Math.random()}` }).returning().get();
  const s = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: user.id }).returning().get();
  for (const shot of shots) db.insert(schema.submissionScreenshots).values({ submissionId: s.id, screenshotType: shot.type, storageUrl: shot.url }).run();
  return s.id;
}

describe("dmScreenshot", () => {
  it("is the main screenshot, downsized to WebP", async () => {
    const id = submissionWith([{ type: "bank", url: await png("bank.png", 300) }, { type: "main", url: await png("main.png", 2400) }]);
    const image = (await dmScreenshot(db, id))!;
    expect(image.name).toBe("screenshot.webp");
    const meta = await sharp(image.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(DM_IMAGE_MAX_WIDTH);
  });

  it("falls back to a Proof screenshot, and never enlarges a small one", async () => {
    const image = (await dmScreenshot(db, submissionWith([{ type: "proof", url: await png("proof.png", 400) }])))!;
    expect((await sharp(image.data).metadata()).width).toBe(400);
  });

  it("is null without a readable file", async () => {
    expect(await dmScreenshot(db, submissionWith([]))).toBeNull();
    expect(await dmScreenshot(db, submissionWith([{ type: "main", url: "/uploads/missing.png" }]))).toBeNull();
    fs.writeFileSync(path.join(dir, "broken.png"), "not an image");
    expect(await dmScreenshot(db, submissionWith([{ type: "main", url: "/uploads/broken.png" }]))).toBeNull();
  });

  it("only reads inside the uploads directory", () => {
    expect(uploadPath("/uploads/a/b.png")).toBe(path.join(dir, "a", "b.png"));
    expect(uploadPath("/uploads/../secret.png")).toBeNull();
    expect(uploadPath("https://example.com/x.png")).toBeNull();
  });
});
