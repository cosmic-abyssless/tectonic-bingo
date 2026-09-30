// Attaching a Historical Bingo's imported screenshots one at a time (#320): routes/historicalScreenshots.ts over a real
// in-memory DB, hit over HTTP, with the audit context mounted so the fallback entry would show if a request left none.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { eq, isNotNull } from "drizzle-orm";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { richHistoricalBundle } from "../testUtils/fixtures/richHistoricalBundle";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));
const uploads = vi.hoisted(() => ({ dir: "" }));
vi.mock("../config", async (importOriginal) => {
  const real = await importOriginal<typeof import("../config")>();
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  uploads.dir = fs.mkdtempSync(path.join(os.tmpdir(), "historical-screenshots-"));
  return { ...real, UPLOADS_DIR: uploads.dir };
});
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let admin: SessionUser;
let member: SessionUser;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;
let png: Buffer;

// The rich fixture's screenshots: every drop and Proof screenshot but the one recorded without.
const KEYS = ["shot-lava-1", "shot-lava-2", "shot-lava-3", "shot-lava-4", "shot-lava-5", "shot-lava-6", "shot-lava-proof", "shot-sea-1", "shot-sea-2", "shot-sea-proof"];

beforeAll(async () => {
  ({ db } = (await import("../db")) as unknown as { db: typeof db });
  const { default: router } = await import("./historicalScreenshots");
  const { auditContext } = await import("../audit/middleware");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/bingos/:slug/admin/historical", router);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#3498db" } }).png().toBuffer();
});

afterAll(() => {
  server.close();
  fs.rmSync(uploads.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Variants are written in the background after each upload (as for a live one): let them finish before the next test.
afterEach(async () => {
  await vi.waitFor(() => {
    const files = storedFiles();
    expect(files.filter((f) => f.endsWith(".tmp"))).toEqual([]);
    for (const f of files.filter((f) => f.endsWith(".png"))) expect(files).toEqual(expect.arrayContaining([f.replace(/\.png$/, "-thumb.webp"), f.replace(/\.png$/, "-full.webp")]));
  }, { timeout: 5000 });
});

beforeEach(async () => {
  for (const f of fs.readdirSync(uploads.dir)) fs.rmSync(path.join(uploads.dir, f), { recursive: true, force: true });
  for (const table of [
    schema.auditLog, schema.claims, schema.submissionScreenshots, schema.submissions, schema.teamNodeState, schema.draftPicks, schema.signupAnswers, schema.signupQuestions,
    schema.signups, schema.teamMembers, schema.historicalStandings, schema.womPastCompetitions, schema.bingoLines, schema.tiles, schema.nodeEdges, schema.nodes, schema.teams, schema.bingos, schema.users,
  ]) {
    db.delete(table).run();
  }
  const row = (discordId: string, isAdmin: boolean) => db.insert(schema.users).values({ discordId, discordUsername: discordId, isAdmin, inGuild: true }).returning().get();
  const a = row("admin", true);
  const m = row("member", false);
  admin = { id: a.id, discordId: a.discordId, isAdmin: true } as SessionUser;
  member = { id: m.id, discordId: m.discordId, isAdmin: false } as SessionUser;
  const { importHistoricalBundle } = await import("../services/historicalImportService");
  await importHistoricalBundle(db, richHistoricalBundle(), { createdByUserId: a.id, uploadsDir: uploads.dir });
  db.insert(schema.bingos).values({ slug: "live-one", name: "Live", boardRows: 3, boardCols: 3, createdByUserId: a.id }).run();
  actingAs = admin;
});

const URL_BASE = "/api/bingos/sample-historical-2024/admin/historical/screenshots";

async function upload(key: string, file: Buffer = png, type = "image/png", slug = "sample-historical-2024") {
  const form = new FormData();
  form.append("screenshot", new Blob([file], { type }), "shot.png");
  const res = await fetch(`${base}/api/bingos/${slug}/admin/historical/screenshots/${encodeURIComponent(key)}`, { method: "POST", body: form });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function status() {
  const res = await fetch(`${base}${URL_BASE}`);
  return { status: res.status, body: (await res.json()) as { pending: number; attached: number; pendingKeys: string[] } };
}
const screenshotOf = (key: string) => db.select().from(schema.submissionScreenshots).where(eq(schema.submissionScreenshots.historicalKey, key)).get()!;
const auditActions = () => db.select().from(schema.auditLog).all().map((e) => e.action);
const storedFiles = () => fs.readdirSync(uploads.dir).filter((f) => !fs.statSync(path.join(uploads.dir, f)).isDirectory());

describe("attaching a screenshot", () => {
  it("attaches a pending one through the Submission screenshot pipeline, variants included", async () => {
    const res = await upload("shot-lava-1");
    expect(res).toMatchObject({ status: 201, body: { attached: true, alreadyAttached: false, status: { pending: 9, attached: 1 } } });
    const url = screenshotOf("shot-lava-1").storageUrl;
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    const name = url.slice("/uploads/".length);
    const stem = name.replace(/\.png$/, "");
    await vi.waitFor(() => expect(storedFiles().sort()).toEqual([name, `${stem}-full.webp`, `${stem}-thumb.webp`].sort()));
    expect(screenshotOf("shot-lava-2").storageUrl).toBe("");
  });

  it("does nothing the second time, storing no copy", async () => {
    await upload("shot-lava-1");
    const url = screenshotOf("shot-lava-1").storageUrl;
    await vi.waitFor(() => expect(storedFiles()).toHaveLength(3));
    const again = await upload("shot-lava-1");
    expect(again).toMatchObject({ status: 200, body: { attached: false, alreadyAttached: true, status: { pending: 9, attached: 1 } } });
    expect(screenshotOf("shot-lava-1").storageUrl).toBe(url);
    expect(storedFiles()).toHaveLength(3);
  });

  it("refuses an unknown key, a file that isn't an image, and a Bingo that isn't Historical", async () => {
    expect(await upload("shot-nobody")).toEqual({ status: 404, body: { error: '"shot-nobody" isn\'t one of this Bingo\'s imported screenshots' } });
    expect((await upload("shot-lava-1", Buffer.from("not a picture"), "text/plain")).status).toBe(415);
    expect(await upload("shot-lava-1", Buffer.from("not a picture either"), "image/png")).toEqual({ status: 415, body: { error: "That file isn't an image that can be read" } });
    expect((await upload("shot-lava-1", png, "image/png", "live-one")).status).toBe(409);
    expect((await upload("shot-lava-1", png, "image/png", "nowhere")).status).toBe(404);
    expect(screenshotOf("shot-lava-1").storageUrl).toBe("");
    expect(storedFiles()).toEqual([]);
  });

  it("refuses a file over the upload limit, saying so", async () => {
    const res = await upload("shot-lava-1", Buffer.alloc(6 * 1024 * 1024));
    expect(res).toEqual({ status: 413, body: { error: "That image is too large — the limit is 5 MB" } });
  });

  it("is for Site Admins only", async () => {
    actingAs = member;
    expect((await upload("shot-lava-1")).status).toBe(403);
    expect((await status()).status).toBe(403);
    actingAs = null;
    expect((await upload("shot-lava-1")).status).toBe(401);
  });
});

describe("the status", () => {
  it("counts pending and attached, and lists the keys still to upload", async () => {
    expect((await status()).body).toEqual({ pending: 10, attached: 0, pendingKeys: KEYS });
    await upload("shot-sea-2");
    await upload("shot-lava-proof");
    expect((await status()).body).toEqual({ pending: 8, attached: 2, pendingKeys: KEYS.filter((k) => k !== "shot-sea-2" && k !== "shot-lava-proof") });
  });

  it("is refused for a Bingo that isn't Historical", async () => {
    expect((await fetch(`${base}/api/bingos/live-one/admin/historical/screenshots`)).status).toBe(409);
  });
});

it("writes one audit entry, when the last pending screenshot is attached", async () => {
  for (const key of KEYS.slice(0, -1)) expect((await upload(key)).status).toBe(201);
  expect(auditActions()).toEqual(["bingo.historical_imported"]);
  expect((await upload(KEYS.at(-1)!)).body).toMatchObject({ attached: true, status: { pending: 0, attached: 10, pendingKeys: [] } });
  expect(auditActions()).toEqual(["bingo.historical_imported", "bingo.historical_screenshots_attached"]);
  const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "bingo.historical_screenshots_attached")).get()!;
  expect(JSON.parse(entry.details)).toEqual({ slug: "sample-historical-2024", name: "Spring Bingo 2024 (sample)", screenshots: 10 });
  // Repeats after that add nothing.
  await upload(KEYS[0]!);
  expect(auditActions()).toHaveLength(2);
  expect(db.select().from(schema.submissionScreenshots).where(isNotNull(schema.submissionScreenshots.historicalKey)).all().every((s) => s.storageUrl !== "")).toBe(true);
});
