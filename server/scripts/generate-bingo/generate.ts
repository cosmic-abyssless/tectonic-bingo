// Makes a prod-like "testdata-" bingo on a dev-mode server (local, a private one, or staging): signups, the draft and
// play, through the real endpoints at spoofed times. The run itself happens inside the server (the same job the site
// admin's Test data tab starts, src/devTools/generateBingo/job.ts); this starts it and prints its log as it goes.
// See docs/generate-bingo.md.
import fs from "node:fs";
import path from "node:path";
import type { BingoExportDocument } from "@bingo/shared";
import type { GenerateJob } from "../../src/devTools/generateBingo/job";
import { describeTimeline, playerCount } from "../../src/devTools/generateBingo/run";
import { buildTimeline } from "../../src/devTools/generateBingo/timeline";
import { UsageError, connect, parseArgs } from "./common";

const DEFAULT_EXPORT = path.resolve(__dirname, "../../../tectonic-comics-bingo-export.json");
const POLL_MS = 1000;

const log = (message: string) => console.log(`[generate-bingo] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    const tl = buildTimeline(args.stage, { now: new Date(), progress: args.progress, days: args.days });
    log(`slug ${args.slug}, seed ${args.seed}, ${playerCount(args)} players, ${args.teams} teams of ~${args.teamSize}`);
    for (const line of describeTimeline(tl)) log(line);
    log("--dry-run: nothing was sent");
    return;
  }

  const { api, admin } = await connect(args.base, args.admin, args.basicAuth);
  const session = api.as(admin.discordId);

  let board: { from: string } | { document: BingoExportDocument };
  if (args.from) board = { from: args.from };
  else {
    const file = args.exportPath ?? DEFAULT_EXPORT;
    if (!fs.existsSync(file)) throw new UsageError(`No export at ${file}: pass --export <file>, or --from <slug> to copy a bingo already on the server`);
    board = { document: JSON.parse(fs.readFileSync(file, "utf-8")) as BingoExportDocument };
  }

  const { stage, progress, days, teams, teamSize, mods, me, seed, slug } = args;
  const { job: started } = await session.post<{ job: GenerateJob }>("/api/dev/generate", { stage, progress, days, teams, teamSize, mods, me, seed, slug, ...board });
  log(`started on ${args.base} as ${admin.discordUsername}`);

  let after = 0;
  for (;;) {
    const { job } = await session.get<{ job: GenerateJob | null }>(`/api/dev/generate?after=${after}`);
    if (!job || job.id !== started.id) throw new Error("The server lost track of the run (was it restarted?)");
    for (const line of job.log) {
      console.log(`[generate-bingo] ${line.message}`);
      after = line.seq;
    }
    if (job.status === "failed") {
      process.exitCode = 1;
      break;
    }
    if (job.status === "done") {
      if (job.problems.length > 0) process.exitCode = 1;
      log(`tear it down with: npm run generate-bingo:teardown -- --slug ${job.slug}${args.base !== "http://localhost:3001" ? ` --base ${args.base}` : ""}`);
      break;
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? `error: ${err.message}` : err);
  process.exit(err instanceof UsageError ? 2 : 1);
});
