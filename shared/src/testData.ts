// The test data generator's run, as the server's dev routes (/api/dev/generate) report it and the site admin's Test
// data tab shows it. Dev mode only (dev-login on: local servers and staging, never production). See
// docs/generate-bingo.md.

/** Where a generated bingo is left. */
export type TestDataStage = "signup" | "captains" | "draft" | "reveal" | "live" | "complete";
export const TEST_DATA_STAGES: readonly TestDataStage[] = ["signup", "captains", "draft", "reveal", "live", "complete"];

export interface TestDataOptions {
  stage: TestDataStage;
  /** Live only: how far through the event we are, 0.02-1. */
  progress: number;
  /** Length of the event, in days. */
  days: number;
  teams: number;
  teamSize: number;
  /** Mods besides the admin. */
  mods: number;
  /** A discordId to sign up, draft onto a team and make a mod (the person QA-ing), or null. */
  me: string | null;
  /** The same seed and options give the same people, choices and outcomes. */
  seed: number;
  /** Always starts with "testdata-". */
  slug: string;
}

export interface TestDataLogLine {
  /** 1, 2, 3...: a poller asks for the lines after the last one it has. */
  seq: number;
  at: string;
  message: string;
}

export interface TestDataJob {
  id: string;
  status: "running" | "done" | "failed";
  slug: string;
  options: TestDataOptions;
  /** Where the board came from: another bingo's slug, or "document" (sent with the request, e.g. the CLI's --export). */
  boardFrom: string;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** Failed sanity checks (a bug in the generator, not the app). */
  problems: string[];
  /** How many lines the log has had in all; `log` keeps only the most recent ones. */
  logCount: number;
  log: TestDataLogLine[];
}

/** A generated bingo on the server (GET /api/dev/bingos). */
export interface TestDataBingo {
  id: string;
  slug: string;
  name: string;
  stage: string;
  createdAt: string;
}
