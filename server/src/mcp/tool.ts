// What an admin MCP tool is (see tools.ts, which serves them).
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as z from "zod";
import type * as schema from "../db/schema";
import type { SessionUser } from "../types";

type Db = BetterSQLite3Database<typeof schema>;

export interface McpToolContext {
  db: Db;
  /** The admin the token belongs to, as of this call. */
  user: SessionUser;
}

export interface McpTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** The Bingo a call is about, for its audit entry; site-level (null) when absent. */
  bingoIdFor?: (args: z.infer<S>, ctx: McpToolContext) => string | null;
  run: (args: z.infer<S>, ctx: McpToolContext) => unknown;
  /** Facts about a successful call's result to add to its audit entry (e.g. how many rows a query returned). */
  auditDetails?: (result: unknown) => { rowCount?: number };
}

export function defineTool<S extends z.ZodObject>(tool: McpTool<S>): McpTool<S> {
  return tool;
}

/** Thrown by a tool for an answer the caller should see as a tool error (an unknown slug), not a server fault. */
export class McpToolError extends Error {}
