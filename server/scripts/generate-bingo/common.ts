// Shared by generate.ts and teardown.ts: reading the command line, and checking the server is one we may
// run against.
import { Api } from "./client";
import { TARGET_STAGES, type TargetStage } from "./timeline";

export const DEV_SERVER_HINT =
  "Start the server with DEV_LOGIN_ENABLED=true PLAYER_STATS_FETCH_DISABLED=true WOM_COMPETITION_SYNC_DISABLED=true and TECTONIC_API_URL left blank (see server/.env.example).";

export interface Args {
  stage: TargetStage;
  progress: number;
  days: number;
  teams: number;
  teamSize: number;
  mods: number;
  me: string | null;
  admin: string | null;
  seed: number;
  base: string;
  slug: string;
  dryRun: boolean;
  exportPath: string | null;
  // teardown only
  all: boolean;
}

export class UsageError extends Error {}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function defaultSlug(now: Date): string {
  return `testdata-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

export function parseArgs(argv: string[], now = new Date()): Args {
  const raw = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new UsageError(`Unexpected argument "${a}"`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) raw.set(key, true);
    else {
      raw.set(key, next);
      i++;
    }
  }
  const known = new Set(["stage", "progress", "days", "teams", "team-size", "mods", "me", "admin", "seed", "base", "slug", "dry-run", "export", "all"]);
  for (const key of raw.keys()) if (!known.has(key)) throw new UsageError(`Unknown option --${key}`);

  const str = (key: string): string | null => {
    const v = raw.get(key);
    if (v === undefined) return null;
    if (v === true) throw new UsageError(`--${key} needs a value`);
    return v;
  };
  const num = (key: string, fallback: number, min: number, max: number, whole = false): number => {
    const v = str(key);
    if (v === null) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) throw new UsageError(`--${key} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}`);
    return n;
  };

  const stage = (str("stage") ?? "live") as TargetStage;
  if (!TARGET_STAGES.includes(stage)) throw new UsageError(`--stage must be one of ${TARGET_STAGES.join(", ")}`);
  const slug = str("slug") ?? defaultSlug(now);
  if (!/^testdata-[a-z0-9-]+$/.test(slug)) throw new UsageError('--slug must start with "testdata-" and use lowercase letters, numbers and hyphens');

  return {
    stage,
    progress: num("progress", 0.5, 0.02, 1),
    days: num("days", 9, 1, 60),
    teams: num("teams", 6, 2, 12, true),
    teamSize: num("team-size", 14, 2, 30, true),
    mods: num("mods", 3, 1, 10, true),
    me: str("me"),
    admin: str("admin"),
    seed: num("seed", Math.floor(Math.random() * 1_000_000), 0, 4_294_967_295, true),
    base: str("base") ?? "http://localhost:3001",
    slug,
    dryRun: raw.has("dry-run"),
    exportPath: str("export"),
    all: raw.has("all"),
  };
}

interface DevUser {
  id: string;
  discordId: string;
  discordUsername: string;
  isAdmin: boolean;
}

/** Logs in as the site admin (the one given, else the first there is) and checks the server is in dev mode. */
export async function connect(base: string, adminOverride: string | null): Promise<{ api: Api; admin: DevUser; users: DevUser[] }> {
  const api = new Api(base);
  let users: DevUser[];
  try {
    users = (await api.as(null).get<{ users: DevUser[] }>("/auth/dev-users")).users;
  } catch (err) {
    throw new UsageError(`Can't reach a dev server at ${base}: ${err instanceof Error ? err.message : err}\n${DEV_SERVER_HINT}`);
  }
  const admin = adminOverride ? users.find((u) => u.discordId === adminOverride) : users.find((u) => u.isAdmin);
  if (!admin) throw new UsageError(adminOverride ? `No dev user with discordId ${adminOverride}` : "No site admin among the dev users; pass one with --admin <discordId>");
  if (!admin.isAdmin) throw new UsageError(`${admin.discordUsername} is not a site admin`);
  const me = await api.as(admin.discordId).get<{ devMode: boolean }>("/api/me");
  if (!me.devMode) throw new UsageError(`The server is not in dev mode.\n${DEV_SERVER_HINT}`);
  return { api, admin, users };
}
