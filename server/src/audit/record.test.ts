import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { audit, diffFields, markAuditedNoop, redactBody } from "./record";
import { runWithAuditContext, type AuditContext } from "./context";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function makeCtx(overrides: Partial<AuditContext> = {}): AuditContext {
  return { requestId: "req-1", actorUserId: null, actorType: "system", actorRole: "system", recorded: 0, skip: null, ...overrides };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("audit()", () => {
  it("inserts a row using the action's registry default visibility when none is given", () => {
    const id = audit(db, { action: "bingo.created", bingoId: "b1", entity: { type: "bingo", id: "b1", label: "Test" }, details: { slug: "test", name: "Test", theme: "default", boardRows: 3, boardCols: 3, source: "form" } });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id)).get();
    expect(row).toBeTruthy();
    expect(row!.visibility).toBe("mods");
  });

  it("does not insert a row when the enclosing transaction throws", () => {
    expect(() => {
      db.transaction((tx) => {
        audit(tx, { action: "bingo.created", bingoId: "b1", entity: { type: "bingo", id: "b1", label: "Test" }, details: { slug: "test", name: "Test", theme: "default", boardRows: 3, boardCols: 3, source: "form" } });
        throw new Error("boom");
      });
    }).toThrow("boom");
    const rows = db.select().from(schema.auditLog).all();
    expect(rows).toHaveLength(0);
  });

  it("explicit actor: 'system' overrides a live user context", () => {
    const ctx = makeCtx({ actorUserId: "player-1", actorType: "user", actorRole: "player" });
    runWithAuditContext(ctx, () => {
      audit(db, { action: "wom.roster_synced", bingoId: "b1", entity: { type: "bingo", id: "b1" }, details: {}, actor: "system" });
    });
    const row = db.select().from(schema.auditLog).all()[0]!;
    expect(row.actorType).toBe("system");
    expect(row.actorRole).toBe("system");
    expect(row.actorUserId).toBeNull();
  });

  it("uses the ambient context's actor when none is passed explicitly", () => {
    const mod = db.insert(schema.users).values({ discordId: "mod-discord", discordUsername: "mod" }).returning().get();
    const ctx = makeCtx({ actorUserId: mod.id, actorType: "user", actorRole: "mod", requestId: "req-42" });
    runWithAuditContext(ctx, () => {
      audit(db, { action: "team.updated", bingoId: "b1", entity: { type: "team", id: "t1", label: "Team" }, details: { changes: { before: {}, after: {} } }, teamId: "t1" });
    });
    const row = db.select().from(schema.auditLog).all()[0]!;
    expect(row.actorUserId).toBe(mod.id);
    expect(row.actorRole).toBe("mod");
    expect(row.requestId).toBe("req-42");
  });

  it("falls back to system with no ambient context and no explicit actor", () => {
    const id = audit(db, { action: "wom.roster_synced", bingoId: null, entity: { type: "bingo", id: null }, details: {} });
    const row = db.select().from(schema.auditLog).all().find((r) => r.id === id)!;
    expect(row.actorType).toBe("system");
    expect(row.requestId).toBeNull();
  });

  it("respects an explicit visibility override", () => {
    audit(db, { action: "bingo.created", bingoId: "b1", entity: { type: "bingo", id: "b1" }, details: { slug: "x", name: "x", theme: "x", boardRows: 1, boardCols: 1, source: "form" }, visibility: "public" });
    const row = db.select().from(schema.auditLog).all()[0]!;
    expect(row.visibility).toBe("public");
  });

  it("bumps the ambient context's recorded counter", () => {
    const ctx = makeCtx();
    runWithAuditContext(ctx, () => {
      audit(db, { action: "wom.roster_synced", bingoId: null, entity: { type: "bingo", id: null }, details: {} });
    });
    expect(ctx.recorded).toBe(1);
  });

  it("caps oversized details at 8KB with a truncated marker", () => {
    const huge = "x".repeat(20000);
    const id = audit(db, { action: "settings.updated", bingoId: "b1", entity: { type: "bingo", id: "b1" }, details: { changes: { before: {}, after: { rulesMarkdown: huge } } } as never });
    const row = db.select().from(schema.auditLog).all().find((r) => r.id === id)!;
    const parsed = JSON.parse(row.details);
    expect(parsed.truncated).toBe(true);
  });
});

describe("markAuditedNoop()", () => {
  it("bumps recorded without inserting a row", () => {
    const ctx = makeCtx();
    runWithAuditContext(ctx, () => markAuditedNoop());
    expect(ctx.recorded).toBe(1);
    expect(db.select().from(schema.auditLog).all()).toHaveLength(0);
  });

  it("is a no-op with no ambient context", () => {
    expect(() => markAuditedNoop()).not.toThrow();
  });
});

describe("diffFields()", () => {
  it("returns only changed keys, before and after", () => {
    const result = diffFields({ name: "Old", color: "red" }, { name: "New", color: "red" });
    expect(result).toEqual({ before: { name: "Old" }, after: { name: "New" } });
  });

  it("returns null when nothing in scope changed", () => {
    expect(diffFields({ name: "Same" }, { name: "Same" })).toBeNull();
  });

  it("normalizes Date fields to ISO strings", () => {
    const before = new Date("2026-01-01T00:00:00.000Z");
    const after = new Date("2026-02-01T00:00:00.000Z");
    const result = diffFields({ startsAt: before }, { startsAt: after });
    expect(result).toEqual({ before: { startsAt: "2026-01-01T00:00:00.000Z" }, after: { startsAt: "2026-02-01T00:00:00.000Z" } });
  });

  it("redacts listed keys on both sides without leaking the values", () => {
    const result = diffFields({ code: "old-secret" }, { code: "new-secret" }, { redact: ["code"] });
    expect(result).toEqual({ before: { code: "[redacted]" }, after: { code: "[redacted]" } });
  });

  it("honors `only` to restrict which keys are compared", () => {
    const result = diffFields({ name: "A", noise: 1 }, { name: "A", noise: 2 }, { only: ["name"] });
    expect(result).toBeNull();
  });

  it("honors `exclude`", () => {
    const result = diffFields({ name: "A", noise: 1 }, { name: "A", noise: 2 }, { exclude: ["noise"] });
    expect(result).toBeNull();
  });
});

describe("redactBody()", () => {
  it("redacts keys matching the secret pattern, recursively", () => {
    const out = redactBody({ womGroupVerificationCode: "abc", nested: { password: "x", ok: "keep" } }) as Record<string, unknown>;
    expect(out.womGroupVerificationCode).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).ok).toBe("keep");
  });

  it("truncates output over the byte cap", () => {
    const out = redactBody({ big: "x".repeat(10000) }, 100) as { truncated: boolean };
    expect(out.truncated).toBe(true);
  });
});
