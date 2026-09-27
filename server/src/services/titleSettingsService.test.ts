import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DEFAULT_LUCK_WEIGHTS, DEFAULT_TITLE_SETTINGS, TITLES, pickTitles, titleMinimum } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { getBingoTitleSettings, getTitleSettings, updateTitleSettings } from "./titleSettingsService";
import { advanceStage, deleteBingo } from "./bingoService";

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

describe("A Finished Bingo's Title settings (#221)", () => {
  let finishedId: string;
  let liveId: string;
  const bingoRow = (id: string) => db.select().from(schema.bingos).where(eq(schema.bingos.id, id)).get()!;
  const settingsOf = (id: string) => getBingoTitleSettings(db, bingoRow(id));
  const frozenRow = (id: string) => db.select().from(schema.bingoTitleSettings).where(eq(schema.bingoTitleSettings.bingoId, id)).get();
  const makeBingo = (slug: string, stage: "live" | "complete") => {
    const id = db.insert(schema.bingos).values({ slug, name: slug, boardRows: 1, boardCols: 1, createdByUserId: adminId }).returning().get().id;
    advanceStage(db, { bingoId: id, toStage: stage, changedByUserId: adminId });
    return id;
  };

  beforeEach(() => {
    updateTitleSettings(db, { minimums: { grinder: 25 }, disabled: ["dry"] }, adminId);
    finishedId = makeBingo("finished", "complete");
    liveId = makeBingo("live", "live");
  });

  it("stores the settings in force, every default spelled out, and every Title that exists, on finishing", () => {
    const row = frozenRow(finishedId)!;
    const minimums = Object.fromEntries(TITLES.filter((t) => t.minimum).map((t) => [t.id, t.minimum!.default]));
    expect(JSON.parse(row.settingsJson)).toEqual({ minimums: { ...minimums, grinder: 25 }, disabled: ["dry"], luck: DEFAULT_LUCK_WEIGHTS });
    expect(JSON.parse(row.titleIdsJson)).toEqual(TITLES.map((t) => t.id));
    expect(frozenRow(liveId)).toBeUndefined();
  });

  it("keeps them when the global settings change, while a Live Bingo picks the change up", () => {
    const luck = { ...DEFAULT_LUCK_WEIGHTS, spoonMinLuck: 3 };
    updateTitleSettings(db, { minimums: { grinder: 40, carry: 0.5 }, disabled: ["spoon"], luck }, adminId);

    expect(settingsOf(finishedId)).toMatchObject({ disabled: ["dry"], luck: DEFAULT_LUCK_WEIGHTS });
    expect(settingsOf(finishedId).minimums).toMatchObject({ grinder: 25, carry: 1 });
    expect(settingsOf(liveId)).toEqual({ minimums: { grinder: 40, carry: 0.5 }, disabled: ["spoon"], luck });
  });

  it("keeps a default in force when it finished, even after the default changes in code", () => {
    const hoarder = TITLES.find((t) => t.id === "hoarder")!;
    const before = hoarder.minimum!.default;
    hoarder.minimum!.default = 99;
    try {
      expect(titleMinimum(hoarder, settingsOf(finishedId))).toBe(before);
      expect(titleMinimum(hoarder, settingsOf(liveId))).toBe(99);
    } finally {
      hoarder.minimum!.default = before;
    }
  });

  it("switches off a Title added after it finished", () => {
    const ids = TITLES.map((t) => t.id).filter((id) => id !== "overachiever");
    db.update(schema.bingoTitleSettings).set({ titleIdsJson: JSON.stringify(ids) }).where(eq(schema.bingoTitleSettings.bingoId, finishedId)).run();

    expect(settingsOf(finishedId).disabled).toEqual(["dry", "overachiever"]);
    const picked = pickTitles([], { now: new Date(), liveAt: null, endedAt: null }, settingsOf(finishedId));
    expect(picked.map((p) => p.title.id)).not.toContain("overachiever");
    expect(settingsOf(liveId).disabled).toEqual(["dry"]);
  });

  it("goes back to the global settings when reopened, and takes a fresh copy when finished again", () => {
    advanceStage(db, { bingoId: finishedId, toStage: "live", changedByUserId: adminId });
    expect(frozenRow(finishedId)).toBeUndefined();
    updateTitleSettings(db, { minimums: { grinder: 40 } }, adminId);
    expect(settingsOf(finishedId)).toEqual(getTitleSettings(db));

    advanceStage(db, { bingoId: finishedId, toStage: "complete", changedByUserId: adminId });
    updateTitleSettings(db, {}, adminId);
    expect(settingsOf(finishedId).minimums.grinder).toBe(40);
    expect(settingsOf(finishedId).disabled).toEqual([]);
  });

  it("is deleted with its Bingo", () => {
    deleteBingo(db, finishedId);
    expect(frozenRow(finishedId)).toBeUndefined();
  });
});
