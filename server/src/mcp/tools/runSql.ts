import * as z from "zod";
import { ChildQueryError, ChildTimeoutError, runInChild } from "../sql/child";
import { currentReplica, REPLICA_INTERVAL_MS } from "../sql/replica";
import { defineTool, McpToolError } from "../tool";
import { LIST_BUDGET } from "./common";

export const SQL_LIMITS = {
  /** The query's process is killed after this. */
  timeoutMs: 10_000,
  rowLimit: 1_000,
  /** Characters of JSON the rows may take, like the other tools' lists. */
  charBudget: LIST_BUDGET,
  /** Longer text values are cut to this many characters. */
  cellLimit: 4_000,
};

// What a query may start with, after comments: a statement that only reads. The child also refuses anything SQLite
// doesn't call read-only or that returns no rows (ATTACH, PRAGMA settings); this gives a clearer error first.
const LEADING_NOISE = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?(?:\*\/|$))*/;
const READ_KEYWORDS = new Set(["SELECT", "WITH", "VALUES", "EXPLAIN"]);

/** "3 minutes ago", for how old the replica's data is. */
export function ageText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/** When the replica's data is from, for an answer; a tool error while there's no replica yet. */
export function replicaAge(now = new Date()): { path: string; dataAsOf: string; dataAge: string } {
  const replica = currentReplica();
  if (!replica) throw new McpToolError("The SQL copy of the database isn't ready yet (it is built when the server starts). Try again in a minute, or use the other tools meanwhile.");
  return { path: replica.path, dataAsOf: replica.builtAt.toISOString(), dataAge: `data as of ${ageText(now.getTime() - replica.builtAt.getTime())}` };
}

export interface SqlAnswer {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: string | null;
  dataAsOf: string;
  dataAge: string;
}

export async function runSqlQuery(query: string, limits = SQL_LIMITS, now = new Date()): Promise<SqlAnswer> {
  const keyword = /^[A-Za-z]+/.exec(query.replace(LEADING_NOISE, ""))?.[0]?.toUpperCase();
  if (!keyword || !READ_KEYWORDS.has(keyword)) throw new McpToolError("Only a single read-only query can run: SELECT, WITH, VALUES or EXPLAIN.");
  const { path, dataAsOf, dataAge } = replicaAge(now);

  let result: { columns: string[]; rows: unknown[][]; cut: "rows" | "size" | null };
  try {
    result = await runInChild({ mode: "query", path, sql: query, rowLimit: limits.rowLimit, charBudget: limits.charBudget, cellLimit: limits.cellLimit }, limits.timeoutMs);
  } catch (err) {
    if (err instanceof ChildTimeoutError) throw new McpToolError(`The query ran longer than ${limits.timeoutMs / 1000} seconds and was stopped. Narrow it (a WHERE on bingo_id, fewer joins) or aggregate more.`);
    if (err instanceof ChildQueryError) throw new McpToolError(`SQL error: ${err.message}`);
    throw err;
  }
  const n = result.rows.length;
  const truncated =
    result.cut === "rows"
      ? `Cut off at the ${limits.rowLimit}-row limit: there are more rows. Aggregate, filter or add a LIMIT.`
      : result.cut === "size"
        ? `Cut off after ${n} rows: the answer grew too large. Select fewer or narrower columns (the *_json columns are large), or aggregate.`
        : null;
  return { columns: result.columns, rows: result.rows, rowCount: n, truncated, dataAsOf, dataAge };
}

export const runSql = defineTool({
  name: "run_sql",
  title: "Run a SQL query",
  description:
    `One read-only SQLite query (SELECT, WITH, VALUES or EXPLAIN) over a copy of the site's database that is rebuilt every ${REPLICA_INTERVAL_MS / 60_000} minutes, with secrets and private data removed. ` +
    `Call describe_schema first for the tables, columns and what they mean. Limits: one statement, ${SQL_LIMITS.timeoutMs / 1000} seconds, ${SQL_LIMITS.rowLimit} rows. ` +
    "Scores aren't a column: for points use bingo_summary, tile_stats and player_contributions. Timestamps are unix seconds (datetime(col, 'unixepoch')), except audit_log.created_at in milliseconds.",
  input: z.object({ query: z.string().min(1).max(20_000).describe("One SQLite statement.") }),
  run: ({ query }) => runSqlQuery(query),
  auditDetails: (result) => ({ rowCount: (result as SqlAnswer).rowCount }),
});
