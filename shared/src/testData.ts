// The test data generator's run, as the server's dev routes (/api/dev/generate) report it and the site admin's Test
// data tab shows it. Dev mode only (dev-login on: local servers and staging, never production). See
// docs/generate-bingo.md.

/**
 * Where a generated bingo is left. "historical" and "historical-rich" aren't Stages: they make a Historical Bingo
 * (CONTEXT.md) instead, imported from a generated historical bundle through Site admin → Import historical Bingo's
 * endpoint: a sparse one (Tiles, Teams and standings), or a rich one with Tasks, Submissions, Signups and the Draft.
 */
export type TestDataStage = "signup" | "captains" | "draft" | "reveal" | "live" | "complete" | "historical" | "historical-rich";
export const TEST_DATA_STAGES: readonly TestDataStage[] = ["signup", "captains", "draft", "reveal", "live", "complete", "historical", "historical-rich"];
export const isHistoricalTestDataStage = (stage: TestDataStage): stage is "historical" | "historical-rich" => stage === "historical" || stage === "historical-rich";
export const TEST_DATA_STAGE_LABEL: Record<TestDataStage, string> = {
  signup: "Signups open",
  captains: "Signups closed",
  draft: "Draft",
  reveal: "Board revealed",
  live: "Live",
  complete: "Finished",
  historical: "Historical (imported)",
  "historical-rich": "Historical, rich (imported)",
};

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
  /**
   * The theme the Bingo is drawn in: one of THEME_KEYS (themes.ts), or null to keep its board's own (the Bingo it's
   * copied from, or the export's). A Historical Bingo's bundle has none, so null draws it in the default theme.
   */
  theme: string | null;
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
