// What a generator run is asked to make, checked the same way wherever it comes from: the Test data tab's form (the
// POST body of /api/dev/generate) or the CLI's flags (scripts/generate-bingo/common.ts turns them into this shape).
import type { TestDataOptions } from "@bingo/shared";
import { TARGET_STAGES, type TargetStage } from "./timeline";

/** What a run is asked to make (the shared type, so the Test data tab and the job agree on it). */
export type GenerateOptions = TestDataOptions;

/** The options' own fields as they arrive: strings from the command line, numbers from JSON, anything missing. */
export type RawOptions = Partial<Record<keyof GenerateOptions, unknown>>;

export class OptionsError extends Error {}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function defaultSlug(now: Date): string {
  return `testdata-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

/** Fills in the defaults and checks every field. `names` maps a field to what the caller calls it (--team-size), for messages. */
export function normalizeOptions(raw: RawOptions, now = new Date(), names: Partial<Record<keyof GenerateOptions, string>> = {}): GenerateOptions {
  const label = (key: keyof GenerateOptions) => names[key] ?? key;
  const num = (key: keyof GenerateOptions, fallback: number, min: number, max: number, whole = false): number => {
    const v = raw[key];
    if (v === undefined || v === null || v === "") return fallback;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) {
      throw new OptionsError(`${label(key)} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}`);
    }
    return n;
  };
  const str = (key: keyof GenerateOptions): string | null => {
    const v = raw[key];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string") throw new OptionsError(`${label(key)} must be text`);
    return v.trim() || null;
  };

  const stage = (str("stage") ?? "live") as TargetStage;
  if (!TARGET_STAGES.includes(stage)) throw new OptionsError(`${label("stage")} must be one of ${TARGET_STAGES.join(", ")}`);
  const slug = str("slug") ?? defaultSlug(now);
  if (!/^testdata-[a-z0-9-]+$/.test(slug)) throw new OptionsError(`${label("slug")} must start with "testdata-" and use lowercase letters, numbers and hyphens`);

  return {
    stage,
    progress: num("progress", 0.5, 0.02, 1),
    days: num("days", 9, 1, 60),
    teams: num("teams", 6, 2, 12, true),
    teamSize: num("teamSize", 14, 2, 30, true),
    mods: num("mods", 3, 1, 10, true),
    me: str("me"),
    seed: num("seed", Math.floor(Math.random() * 1_000_000), 0, 4_294_967_295, true),
    slug,
  };
}
