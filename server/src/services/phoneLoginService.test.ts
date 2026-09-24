import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { LINK_TTL_MS, createPhoneLoginLink, getPhoneLoginLinkStatus, previewPhoneLoginLink, redeemPhoneLoginLink } from "./phoneLoginService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let userId: string;
let otherId: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  ({ sqlite, db } = createTestDb());
  userId = db.insert(schema.users).values({ discordId: "1", discordUsername: "phone" }).returning().get().id;
  otherId = db.insert(schema.users).values({ discordId: "2", discordUsername: "other" }).returning().get().id;
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("phone login links", () => {
  it("logs the phone in as the account that made the link, once", () => {
    const link = createPhoneLoginLink(db, userId);
    expect(getPhoneLoginLinkStatus(db, link.id, userId)).toBe("pending");
    expect(previewPhoneLoginLink(db, link.token)?.id).toBe(userId);
    // Previewing doesn't use it up.
    expect(redeemPhoneLoginLink(db, link.token)?.id).toBe(userId);
    expect(getPhoneLoginLinkStatus(db, link.id, userId)).toBe("used");
    expect(redeemPhoneLoginLink(db, link.token)).toBeNull();
    expect(previewPhoneLoginLink(db, link.token)).toBeNull();
  });

  it("stops working once it expires", () => {
    const link = createPhoneLoginLink(db, userId);
    vi.setSystemTime(Date.now() + LINK_TTL_MS + 1000);
    expect(getPhoneLoginLinkStatus(db, link.id, userId)).toBe("expired");
    expect(previewPhoneLoginLink(db, link.token)).toBeNull();
    expect(redeemPhoneLoginLink(db, link.token)).toBeNull();
  });

  it("retires an account's unused link when it makes another", () => {
    const first = createPhoneLoginLink(db, userId);
    const second = createPhoneLoginLink(db, userId);
    expect(redeemPhoneLoginLink(db, first.token)).toBeNull();
    expect(getPhoneLoginLinkStatus(db, first.id, userId)).toBe("expired");
    expect(redeemPhoneLoginLink(db, second.token)?.id).toBe(userId);
  });

  it("leaves other accounts' links alone, and doesn't tell anyone else how a link went", () => {
    const mine = createPhoneLoginLink(db, userId);
    createPhoneLoginLink(db, otherId);
    expect(previewPhoneLoginLink(db, mine.token)?.id).toBe(userId);
    expect(getPhoneLoginLinkStatus(db, mine.id, otherId)).toBe("expired");
  });

  it("stores a hash, not the token, and rejects tokens it never made", () => {
    const link = createPhoneLoginLink(db, userId);
    const rows = db.select().from(schema.phoneLoginLinks).all();
    expect(rows.map((r) => r.tokenHash)).not.toContain(link.token);
    expect(redeemPhoneLoginLink(db, "not-a-real-token")).toBeNull();
  });
});
