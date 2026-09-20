// Removes what generate.ts made: `--slug testdata-...` for one bingo, `--all` for every testdata- bingo.
// The server does the work (DELETE /api/dev/bingos/:slug): the bingo and everything under it, its audit rows,
// its uploaded files and any test users nothing else uses.
import { UsageError, connect, parseArgs } from "./common";

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  if (!raw.includes("--slug") && !raw.includes("--all")) throw new UsageError("Pass --slug testdata-... or --all");
  // parseArgs fills a default slug we don't want here, so only trust --slug when it was actually given.
  const args = parseArgs(raw);
  const { api, admin } = await connect(args.base, args.admin);
  const session = api.as(admin.discordId);

  const slugs = args.all ? (await session.get<{ bingos: { slug: string }[] }>("/api/dev/bingos")).bingos.map((b) => b.slug) : [args.slug];
  if (slugs.length === 0) {
    console.log("[teardown] no testdata- bingos to remove");
    return;
  }
  for (const slug of slugs) {
    const result = await session.delete<{ deleted: { users: number; files: number } }>(`/api/dev/bingos/${slug}`);
    console.log(`[teardown] ${slug}: removed ${result.deleted.users} test users and ${result.deleted.files} files`);
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? `error: ${err.message}` : err);
  process.exit(err instanceof UsageError ? 2 : 1);
});
