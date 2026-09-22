// Fakes a WOM competition for an existing bingo's signups, no network call —
// for exercising the past-competition feature (#128) locally without a real
// WOM competition id or hand-edited signup RSNs. See #133. The server does
// the work (POST /api/dev/bingos/:slug/mock-wom-competition); this is just
// the dev-login + arg-parsing wrapper, same shape as generate-bingo/teardown.ts.
import { UsageError, connect } from "./generate-bingo/common";

interface Args {
  slug: string;
  title: string | null;
  metric: string | null;
  gainedMin: number | null;
  gainedMax: number | null;
  base: string;
  admin: string | null;
}

function parseArgs(argv: string[]): Args {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new UsageError(`Unexpected argument "${a}"`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) throw new UsageError(`--${key} needs a value`);
    raw.set(key, next);
    i++;
  }
  const known = new Set(["slug", "title", "metric", "gained-min", "gained-max", "base", "admin"]);
  for (const key of raw.keys()) if (!known.has(key)) throw new UsageError(`Unknown option --${key}`);

  const slug = raw.get("slug");
  if (!slug) throw new UsageError("Pass --slug <bingo-slug>");
  const num = (key: string): number | null => {
    const v = raw.get(key);
    if (v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new UsageError(`--${key} must be a number`);
    return n;
  };

  return {
    slug,
    title: raw.get("title") ?? null,
    metric: raw.get("metric") ?? null,
    gainedMin: num("gained-min"),
    gainedMax: num("gained-max"),
    base: raw.get("base") ?? "http://localhost:3001",
    admin: raw.get("admin") ?? null,
  };
}

interface MockedCompetition {
  womId: number;
  title: string;
  metric: string;
  participantCount: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { api, admin } = await connect(args.base, args.admin);
  const session = api.as(admin.discordId);

  const { competition } = await session.post<{ competition: MockedCompetition }>(`/api/dev/bingos/${args.slug}/mock-wom-competition`, {
    title: args.title ?? undefined,
    metric: args.metric ?? undefined,
    gainedMin: args.gainedMin ?? undefined,
    gainedMax: args.gainedMax ?? undefined,
  });

  console.log(`[mock-wom-competition] "${competition.title}" (womId ${competition.womId}, ${competition.metric}) — ${competition.participantCount} participants matched from ${args.slug}'s signups`);
}

main().catch((err) => {
  console.error(err instanceof UsageError ? `error: ${err.message}` : err);
  process.exit(err instanceof UsageError ? 2 : 1);
});
