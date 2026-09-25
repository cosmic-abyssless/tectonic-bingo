// Title settings (#195): a Site admin tunes each Title's minimum, turns Titles off, and sets the luck weights, while
// a Bingo is Live. Only what differs from the defaults is stored, so a changed default in shared/titles.ts still
// applies wherever nobody overrode it. Titles are recalculated on every stats load, so a change shows at once.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DEFAULT_LUCK_WEIGHTS, DEFAULT_TITLE_SETTINGS, TITLES, type LuckWeights, type TitleId, type TitleSettings } from "@bingo/shared";
import * as schema from "../db/schema";
import { siteSettings } from "../db/schema";
import { now } from "../clock";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const KEY = "titles";

/** What each luck weight may be set to. A floor of 12 is 1 in a trillion. */
const LUCK_LIMITS: Record<keyof LuckWeights, { min: number; max: number; label: string }> = {
  spoonDecay: { min: 0, max: 0.95, label: "Spoon's decay" },
  spoonMinLuck: { min: 0, max: 12, label: "Spoon's floor" },
  dryMinLuck: { min: 0, max: 12, label: "Dry's floor" },
  clutchMinLuck: { min: 0, max: 12, label: "Clutch's floor" },
};
const LUCK_KEYS = Object.keys(LUCK_LIMITS) as (keyof LuckWeights)[];
const MAX_MINIMUM = 1_000_000;

const byId = new Map(TITLES.map((t) => [t.id, t]));

// Stored values are read forgivingly: a Title removed since, or a bad value, falls back to its default.
function resolve(stored: unknown): TitleSettings {
  const raw = (stored && typeof stored === "object" ? stored : {}) as { minimums?: Record<string, unknown>; disabled?: unknown; luck?: Record<string, unknown> };
  const minimums: TitleSettings["minimums"] = {};
  for (const [id, value] of Object.entries(raw.minimums ?? {})) {
    if (byId.get(id as TitleId)?.minimum && typeof value === "number" && Number.isFinite(value)) minimums[id as TitleId] = value;
  }
  const disabled = Array.isArray(raw.disabled) ? raw.disabled.filter((id): id is TitleId => byId.has(id as TitleId)) : [];
  const luck = { ...DEFAULT_LUCK_WEIGHTS };
  for (const key of LUCK_KEYS) {
    const value = raw.luck?.[key];
    if (typeof value === "number" && Number.isFinite(value)) luck[key] = value;
  }
  return { minimums, disabled, luck };
}

export function getTitleSettings(db: Db | Tx): TitleSettings {
  const row = db.select().from(siteSettings).where(eq(siteSettings.key, KEY)).get();
  if (!row) return DEFAULT_TITLE_SETTINGS;
  try {
    return resolve(JSON.parse(row.valueJson));
  } catch {
    return DEFAULT_TITLE_SETTINGS;
  }
}

function validate(input: unknown): TitleSettings {
  if (!input || typeof input !== "object") throw new ServiceError(400, "Title settings must be an object");
  const raw = input as { minimums?: unknown; disabled?: unknown; luck?: unknown };

  const minimums: TitleSettings["minimums"] = {};
  if (raw.minimums !== undefined) {
    if (!raw.minimums || typeof raw.minimums !== "object") throw new ServiceError(400, "minimums must be an object");
    for (const [id, value] of Object.entries(raw.minimums)) {
      const title = byId.get(id as TitleId);
      if (!title) throw new ServiceError(400, `There's no Title "${id}"`);
      if (!title.minimum) throw new ServiceError(400, `${title.name} has no minimum: its luck weights tune it`);
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MINIMUM) throw new ServiceError(400, `${title.name}'s minimum must be a number from 0 to ${MAX_MINIMUM.toLocaleString("en-US")}`);
      if (title.minimum.whole && !Number.isInteger(value)) throw new ServiceError(400, `${title.name}'s minimum must be a whole number`);
      // A default is stored as nothing, so a later change to the default still reaches it.
      if (value !== title.minimum.default) minimums[title.id] = value;
    }
  }

  const disabled: TitleId[] = [];
  if (raw.disabled !== undefined) {
    if (!Array.isArray(raw.disabled)) throw new ServiceError(400, "disabled must be a list of Title ids");
    for (const id of raw.disabled) {
      if (!byId.has(id as TitleId)) throw new ServiceError(400, `There's no Title "${String(id)}"`);
      if (!disabled.includes(id as TitleId)) disabled.push(id as TitleId);
    }
  }

  const luck = { ...DEFAULT_LUCK_WEIGHTS };
  if (raw.luck !== undefined) {
    if (!raw.luck || typeof raw.luck !== "object") throw new ServiceError(400, "luck must be an object");
    for (const [key, value] of Object.entries(raw.luck)) {
      const limit = LUCK_LIMITS[key as keyof LuckWeights];
      if (!limit) throw new ServiceError(400, `There's no luck weight "${key}"`);
      if (typeof value !== "number" || !Number.isFinite(value) || value < limit.min || value > limit.max) throw new ServiceError(400, `${limit.label} must be from ${limit.min} to ${limit.max}`);
      luck[key as keyof LuckWeights] = value;
    }
  }
  return { minimums, disabled, luck };
}

// What the audit log shows: one entry per setting, by name ("Grinder minimum", "Dry": off, "Spoon's floor": 1 in 10).
function describe(settings: TitleSettings): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const title of TITLES) {
    out[title.name] = !settings.disabled.includes(title.id);
    if (title.minimum) out[`${title.name} minimum`] = settings.minimums[title.id] ?? title.minimum.default;
  }
  // Floors as "1 in N" to 6 figures: rounder than that would hide a real change and skip saving it.
  for (const key of LUCK_KEYS) out[LUCK_LIMITS[key].label] = key === "spoonDecay" ? settings.luck[key] : `1 in ${Number((10 ** settings.luck[key]).toPrecision(6))}`;
  return out;
}

/** Replaces the Title settings: every minimum, the Titles turned off and the luck weights. Anything left out is back to its default. */
export function updateTitleSettings(db: Db, input: unknown, userId: string): TitleSettings {
  const next = validate(input);
  return db.transaction((tx) => {
    const before = getTitleSettings(tx);
    const changes = diffFields(describe(before), describe(next));
    if (!changes) {
      markAuditedNoop();
      return before;
    }
    // Luck weights at their defaults are left out too, like minimums.
    const luck = Object.fromEntries(LUCK_KEYS.filter((k) => next.luck[k] !== DEFAULT_LUCK_WEIGHTS[k]).map((k) => [k, next.luck[k]]));
    const valueJson = JSON.stringify({ minimums: next.minimums, disabled: next.disabled, luck });
    tx.insert(siteSettings)
      .values({ key: KEY, valueJson, updatedByUserId: userId, updatedAt: now() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { valueJson, updatedByUserId: userId, updatedAt: now() } })
      .run();
    audit(tx, {
      action: "title_settings.updated",
      bingoId: null,
      entity: { type: "site_settings", id: KEY, label: "Title settings" },
      details: { changes: changes as { before: Record<string, number | string | boolean>; after: Record<string, number | string | boolean> } },
    });
    return next;
  });
}
