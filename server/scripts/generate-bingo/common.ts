// Shared by generate.ts and teardown.ts: reading the command line, and connecting to a server we may run against. The
// generator itself runs inside the server (src/devTools/generateBingo); these scripts only start it and follow it.
import { Api } from "../../src/devTools/generateBingo/client";
import { OptionsError, normalizeOptions, type GenerateOptions } from "../../src/devTools/generateBingo/options";

export const DEV_SERVER_HINT =
  "The server must be in dev mode: DEV_LOGIN_ENABLED=true and NODE_ENV not production (staging already is). Nothing else needs setting: the generator's requests skip OCR and the clan/stats integrations themselves.";

export interface Args extends GenerateOptions {
  admin: string | null;
  base: string;
  dryRun: boolean;
  /** A bingo on the server to copy the board from. */
  from: string | null;
  /** An export file to send instead (the default when --from isn't given). */
  exportPath: string | null;
  /** "user:password" for a server behind a shared password (staging), from --basic-auth or GENERATE_BINGO_BASIC_AUTH. */
  basicAuth: string | null;
  // teardown only
  all: boolean;
}

export class UsageError extends Error {}

/** The flag each option is given as, for messages. */
const FLAG_NAMES: Partial<Record<keyof GenerateOptions, string>> = {
  stage: "--stage", progress: "--progress", days: "--days", teams: "--teams", teamSize: "--team-size", mods: "--mods", me: "--me", seed: "--seed", slug: "--slug",
};

export function parseArgs(argv: string[], now = new Date(), env: NodeJS.ProcessEnv = process.env): Args {
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
  const known = new Set(["stage", "progress", "days", "teams", "team-size", "mods", "me", "admin", "seed", "base", "slug", "dry-run", "export", "from", "basic-auth", "all"]);
  for (const key of raw.keys()) if (!known.has(key)) throw new UsageError(`Unknown option --${key}`);

  const str = (key: string): string | null => {
    const v = raw.get(key);
    if (v === undefined) return null;
    if (v === true) throw new UsageError(`--${key} needs a value`);
    return v;
  };

  let options: GenerateOptions;
  try {
    options = normalizeOptions(
      { stage: str("stage"), progress: str("progress"), days: str("days"), teams: str("teams"), teamSize: str("team-size"), mods: str("mods"), me: str("me"), seed: str("seed"), slug: str("slug") },
      now,
      FLAG_NAMES,
    );
  } catch (err) {
    if (err instanceof OptionsError) throw new UsageError(err.message);
    throw err;
  }
  const from = str("from");
  const exportPath = str("export");
  if (from && exportPath) throw new UsageError("Pass --from or --export, not both");
  const basicAuth = str("basic-auth") ?? (env.GENERATE_BINGO_BASIC_AUTH || null);
  if (basicAuth && !basicAuth.includes(":")) throw new UsageError("--basic-auth must be user:password");

  return {
    ...options,
    admin: str("admin"),
    base: (str("base") ?? "http://localhost:3001").replace(/\/+$/, ""),
    dryRun: raw.has("dry-run"),
    from,
    exportPath,
    basicAuth,
    all: raw.has("all"),
  };
}

interface DevUser {
  id: string;
  discordId: string;
  discordUsername: string;
  isAdmin: boolean;
}

/** An API client for `base`, sending the shared password on every request when there is one. */
export function apiFor(base: string, basicAuth: string | null): Api {
  return new Api(base, basicAuth ? { Authorization: `Basic ${Buffer.from(basicAuth).toString("base64")}` } : {});
}

/** Logs in as the site admin (the one given, else the first there is) and checks the server is in dev mode. */
export async function connect(base: string, adminOverride: string | null, basicAuth: string | null = null): Promise<{ api: Api; admin: DevUser; users: DevUser[] }> {
  const api = apiFor(base, basicAuth);
  let users: DevUser[];
  try {
    users = (await api.as(null).get<{ users: DevUser[] }>("/auth/dev-users")).users;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) throw new UsageError(`${base} asks for a password: pass --basic-auth user:password (or set GENERATE_BINGO_BASIC_AUTH)`);
    throw new UsageError(`Can't reach a dev-mode server at ${base}: ${err instanceof Error ? err.message : err}\n${DEV_SERVER_HINT}`);
  }
  const admin = adminOverride ? users.find((u) => u.discordId === adminOverride) : users.find((u) => u.isAdmin);
  if (!admin) throw new UsageError(adminOverride ? `No dev user with discordId ${adminOverride}` : "No site admin among the dev users; pass one with --admin <discordId>");
  if (!admin.isAdmin) throw new UsageError(`${admin.discordUsername} is not a site admin`);
  const me = await api.as(admin.discordId).get<{ devMode: boolean }>("/api/me");
  if (!me.devMode) throw new UsageError(`The server is not in dev mode.\n${DEV_SERVER_HINT}`);
  return { api, admin, users };
}
