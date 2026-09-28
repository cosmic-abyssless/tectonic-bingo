// The clean replica the SQL tool queries (#292): a copy of the live database with every denied or unclassified table
// and column removed (classification.ts), rebuilt at startup and every 5 minutes. The live file is never queried.
import fs from "fs";
import path from "path";
import { log } from "../../log";
import { allowedColumns } from "./classification";
import { runInChild } from "./child";

export const REPLICA_INTERVAL_MS = 5 * 60_000;
/** A build that takes longer than this is abandoned (and the previous replica kept). */
const BUILD_TIMEOUT_MS = 2 * 60_000;

export interface Replica {
  path: string;
  builtAt: Date;
}

let current: Replica | null = null;

/** The replica queries run against, or null before the first build has finished. */
export function currentReplica(): Replica | null {
  return current;
}

/** Tests only: forget the current replica. */
export function resetReplica(): void {
  current = null;
}

/** Where the replica lives by default: next to the live database, which Litestream alone replicates (by file name). */
export function defaultReplicaPath(dbPath: string): string {
  return process.env.MCP_REPLICA_PATH || path.join(path.dirname(dbPath), "mcp-replica.db");
}

/** Deletes half-built copies a killed build left behind (each build writes its own `<replica>.<pid>.building`). */
function removeAbandonedBuilds(replicaPath: string): void {
  const dir = path.dirname(replicaPath);
  const prefix = `${path.basename(replicaPath)}.`;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(".building")) continue;
    const file = path.join(dir, name);
    // Old enough that no build can still be writing it.
    if (Date.now() - fs.statSync(file).mtimeMs > BUILD_TIMEOUT_MS) fs.rmSync(file, { force: true });
  }
}

/** Builds the replica from `sourcePath` into `replicaPath` and makes it current. Throws on failure, keeping the old one. */
export async function buildReplica(sourcePath: string, replicaPath: string, now: () => Date = () => new Date()): Promise<Replica> {
  fs.mkdirSync(path.dirname(replicaPath), { recursive: true });
  removeAbandonedBuilds(replicaPath);
  const startedAt = now();
  await runInChild({ mode: "build", source: sourcePath, target: replicaPath, allowed: allowedColumns() }, BUILD_TIMEOUT_MS);
  // The copy is as of when the build started.
  current = { path: replicaPath, builtAt: startedAt };
  return current;
}

/** Builds the replica now and every `intervalMs`; a failed build is logged and the previous replica stays. */
export function startReplicaJob(sourcePath: string, replicaPath = defaultReplicaPath(sourcePath), intervalMs = REPLICA_INTERVAL_MS): { stop: () => void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const started = Date.now();
      await buildReplica(sourcePath, replicaPath);
      log.info("mcp replica built", { replicaPath, ms: Date.now() - started });
    } catch (err) {
      log.error("mcp replica build failed; keeping the previous one", { err, replicaPath });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
