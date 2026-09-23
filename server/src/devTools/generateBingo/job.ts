// The generator run as a background job inside the server, so a site admin can start one from the Test data tab (on
// staging, where nobody can run the CLI next to the server) and the CLI can hand its work to a server anywhere.
// The run still goes through the real endpoints: it calls this same server over loopback, logging in as its fake
// players through dev-login like the CLI always has. Dev mode only (routes/dev.ts). One run at a time: two would
// fight over the clock (X-Dev-Now) and the database.
import type { TestDataJob } from "@bingo/shared";
import { Api } from "./client";
import type { GenerateOptions } from "./options";
import { runGenerate, type BoardSource } from "./run";

export type GenerateJob = TestDataJob;

const MAX_LOG_LINES = 2000;

let current: GenerateJob | null = null;

/** The server's own address, as the job's loopback requests see it. */
function loopbackBase(): string {
  return `http://127.0.0.1:${process.env.PORT ?? 3001}`;
}

export function getGenerateJob(): GenerateJob | null {
  return current;
}

export function isGenerateJobRunning(): boolean {
  return current?.status === "running";
}

/** The job with only the log lines after `after` (all of them when it's absent). */
export function jobView(job: GenerateJob, after?: number): GenerateJob {
  return after === undefined ? job : { ...job, log: job.log.filter((l) => l.seq > after) };
}

export interface StartParams {
  options: GenerateOptions;
  board: BoardSource;
  /** The site admin who started it: the run acts as them. */
  adminDiscordId: string;
  startedBy: string;
}

/** Starts a run in the background and returns at once. The caller has checked nothing else is running. */
export function startGenerateJob(params: StartParams): GenerateJob {
  if (isGenerateJobRunning()) throw new Error("A test data run is already in progress");
  const job: GenerateJob = {
    id: crypto.randomUUID(),
    status: "running",
    slug: params.options.slug,
    options: params.options,
    boardFrom: params.board.kind === "bingo" ? params.board.slug : "document",
    startedBy: params.startedBy,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    problems: [],
    logCount: 0,
    log: [],
  };
  current = job;
  const log = (message: string) => {
    job.logCount++;
    job.log.push({ seq: job.logCount, at: new Date().toISOString(), message });
    if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
  };
  // X-Forwarded-Proto: the loopback request is plain HTTP, and on staging the session cookie is Secure, so without it
  // the server would never hand the run a session (index.ts trusts one proxy hop, which is this).
  const api = new Api(loopbackBase(), { "X-Forwarded-Proto": "https" });
  void runGenerate({ api, adminDiscordId: params.adminDiscordId, options: params.options, board: params.board, log })
    .then((result) => {
      job.problems = result.problems;
      log(`done: /b/${job.slug}`);
      job.finishedAt = new Date().toISOString();
      job.status = "done";
    })
    .catch((err: unknown) => {
      job.error = err instanceof Error ? err.message : String(err);
      log(`failed: ${job.error}`);
      console.error(`[dev] test data run ${job.slug} failed`, err);
      job.finishedAt = new Date().toISOString();
      job.status = "failed";
    });
  return job;
}
