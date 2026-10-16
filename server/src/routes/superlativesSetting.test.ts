// The "One Superlative per Player" setting (CONTEXT.md "Superlative") through the settings route: validated, saved and
// audited. Real routers over a real in-memory DB, with the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { Bingo } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

vi.mock("../ocr", () => ({ isOcrEnabled: () => false, analyzeSubmissionScreenshot: vi.fn() }));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let admin: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: adminRouter } = await import("./admin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const { auditContext } = await import("../audit/middleware");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/b1/admin`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")
    .all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
  admin = db.insert(schema.users).values({ discordId: "100", discordUsername: "admin", isAdmin: true }).returning().get();
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "live" }).returning().get();
});

async function patchSettings(body: unknown) {
  actingAs = admin;
  const res = await fetch(`${base}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { bingo: Bingo; error?: string } };
}

const settingsAudits = () => db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "settings.updated")).all();

describe("One Superlative per Player", () => {
  it("is off by default, and saving it on is returned and audited", async () => {
    expect(bingo.superlativesOneEach).toBe(false);
    const { status, body } = await patchSettings({ superlativesOneEach: true });
    expect(status).toBe(200);
    expect(body.bingo.superlativesOneEach).toBe(true);
    expect(db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()?.superlativesOneEach).toBe(true);
    const [row] = settingsAudits();
    expect(JSON.parse(row!.details)).toMatchObject({ changes: { before: { superlativesOneEach: false }, after: { superlativesOneEach: true } } });
  });

  it("must be a boolean", async () => {
    expect(await patchSettings({ superlativesOneEach: "yes" })).toMatchObject({ status: 400, body: { error: "superlativesOneEach must be a boolean" } });
    expect(settingsAudits()).toHaveLength(0);
  });
});
