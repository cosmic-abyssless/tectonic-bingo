// npm run historical:bundle -- <folder> [--out <file>] [--wom-file <file>] [--skip-clan]
// A sparse past Bingo's source folder (bingo.yaml + tiles/) → a historical bundle to upload through Site admin →
// Import historical Bingo, and a report. See README.md. Reads the folder and calls the Wise Old Man and Tectonic APIs;
// never touches a database.
import "../../src/env";
import fs from "node:fs";
import path from "node:path";
import { WomCompetitionClient } from "../../src/services/womCompetitionService";
import { TectonicClient, getTectonicConfig } from "../../src/services/tectonicService";
import { buildBundle, formatReport } from "./build";

class UsageError extends Error {}

const USAGE = "Usage: npm run historical:bundle -- <folder> [--out <file>] [--wom-file <file>] [--skip-clan]";

interface Args {
  folder: string;
  out: string | null;
  /** A saved GET /competitions/{id} response to use instead of fetching it. */
  womFile: string | null;
  /** Don't ask the Tectonic API: every Player is taken as not in the clan (for trying the script without it). */
  skipClan: boolean;
}

function parseArgs(argv: string[]): Args {
  // npm runs the script from server/; paths are the caller's, relative to where they ran npm.
  const resolve = (p: string) => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
  const args: Args = { folder: "", out: null, womFile: null, skipClan: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--out" || a === "--wom-file") {
      const v = argv[++i];
      if (!v) throw new UsageError(`${a} needs a file`);
      if (a === "--out") args.out = resolve(v);
      else args.womFile = resolve(v);
    } else if (a === "--skip-clan") args.skipClan = true;
    else if (a.startsWith("--")) throw new UsageError(`Unknown option ${a}\n${USAGE}`);
    else if (args.folder) throw new UsageError(`One folder at a time (got "${args.folder}" and "${a}")`);
    else args.folder = resolve(a);
  }
  if (!args.folder) throw new UsageError(USAGE);
  return args;
}

async function main(): Promise<number> {
  const { folder, out, womFile, skipClan } = parseArgs(process.argv.slice(2));
  const tectonic = getTectonicConfig();
  if (!tectonic && !skipClan) {
    throw new UsageError("Set TECTONIC_API_URL, TECTONIC_API_KEY and TECTONIC_GUILD_ID in the root .env (the script asks the clan API who's still a member), or pass --skip-clan to try it without");
  }
  const clan = tectonic && !skipClan ? new TectonicClient(tectonic) : null;
  const wom = new WomCompetitionClient();

  const { bundle, report } = await buildBundle(
    folder,
    {
      getCompetition: async (id) => (womFile ? (JSON.parse(fs.readFileSync(womFile, "utf8")) as unknown) : wom.getCompetition(id)),
      getClanMembers: async (ids) => (clan ? clan.getDetailedUsers(ids) : []),
    },
    path.basename(folder),
  );
  if (skipClan) console.log("--skip-clan: nobody was looked up in the clan, so every Player is taken as having left it.\n");
  console.log(formatReport(report));
  if (!bundle) {
    console.log(`\nNo bundle written: fix the ${report.errors.length === 1 ? "error" : `${report.errors.length} errors`} above and run it again.`);
    return 1;
  }
  const file = out ?? path.join(folder, `${bundle.bingo.slug}.historical.json`);
  fs.writeFileSync(file, JSON.stringify(bundle));
  const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(`\nWrote ${file} (${mb} MB): ${bundle.tiles.length} Tiles, ${bundle.teams.length} Teams, ${bundle.players.length} Players, ${bundle.unknownPlayers.length} unknown.`);
  console.log("Upload it through Site admin → Bingos → Import historical.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof UsageError ? err.message : err);
    process.exit(err instanceof UsageError ? 2 : 1);
  },
);
