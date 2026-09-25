import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DEFAULT_LUCK_WEIGHTS, DEFAULT_TITLE_SETTINGS } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { getTitleSettings, updateTitleSettings } from "./titleSettingsService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let adminId: string;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  adminId = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get().id;
});
afterEach(() => {
  sqlite.close();
});

const stored = () => JSON.parse(db.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, "titles")).get()!.valueJson);
const auditRows = () => db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "title_settings.updated")).all();

describe("Title settings", () => {
  it("are the defaults until a Site admin changes them", () => {
    expect(getTitleSettings(db)).toEqual(DEFAULT_TITLE_SETTINGS);
  });

  it("keep what was saved, storing only what differs from the defaults", () => {
    const luck = { ...DEFAULT_LUCK_WEIGHTS, dryMinLuck: 2 };
    updateTitleSettings(db, { minimums: { grinder: 25, carry: 1 }, disabled: ["dry", "butterfingers"], luck }, adminId);

    expect(getTitleSettings(db)).toEqual({ minimums: { grinder: 25 }, disabled: ["dry", "butterfingers"], luck });
    expect(stored()).toEqual({ minimums: { grinder: 25 }, disabled: ["dry", "butterfingers"], luck: { dryMinLuck: 2 } });
  });

  it("puts anything left out back to its default", () => {
    updateTitleSettings(db, { minimums: { grinder: 25 }, disabled: ["dry"] }, adminId);
    updateTitleSettings(db, {}, adminId);
    expect(getTitleSettings(db)).toEqual(DEFAULT_TITLE_SETTINGS);
  });

  it("audits what changed, by name", () => {
    updateTitleSettings(db, { minimums: { grinder: 25 }, disabled: ["dry"], luck: { ...DEFAULT_LUCK_WEIGHTS, spoonMinLuck: 2 } }, adminId);
    const [row] = auditRows();
    expect(JSON.parse(row!.details)).toEqual({
      changes: {
        before: { "Grinder minimum": 10, Dry: true, "Spoon's floor": "1 in 10" },
        after: { "Grinder minimum": 25, Dry: false, "Spoon's floor": "1 in 100" },
      },
    });
  });

  it("saves and audits nothing when nothing changed", () => {
    updateTitleSettings(db, { minimums: { grinder: 10 } }, adminId);
    expect(auditRows()).toHaveLength(0);
    expect(db.select().from(schema.siteSettings).all()).toHaveLength(0);
  });

  it("refuses what it can't use", () => {
    const refuse = (input: unknown) => expect(() => updateTitleSettings(db, input, adminId)).toThrow(expect.objectContaining({ status: 400 }));
    refuse({ minimums: { nope: 1 } });
    refuse({ minimums: { spoon: 1 } }); // tuned by the luck weights
    refuse({ minimums: { grinder: -1 } });
    refuse({ minimums: { collector: 2.5 } }); // a count
    refuse({ disabled: ["nope"] });
    refuse({ luck: { spoonDecay: 1 } }); // would never decay
    refuse({ luck: { dryMinLuck: 13 } });
    refuse({ luck: { mystery: 1 } });
    expect(getTitleSettings(db)).toEqual(DEFAULT_TITLE_SETTINGS);
  });

  it("ignores stored values for Titles that no longer exist", () => {
    db.insert(schema.siteSettings).values({ key: "titles", valueJson: JSON.stringify({ minimums: { retired: 5, grinder: 20 }, disabled: ["retired", "dry"], luck: { spoonDecay: "x" } }), updatedByUserId: adminId, updatedAt: new Date() }).run();
    expect(getTitleSettings(db)).toEqual({ minimums: { grinder: 20 }, disabled: ["dry"], luck: DEFAULT_LUCK_WEIGHTS });
  });
});
