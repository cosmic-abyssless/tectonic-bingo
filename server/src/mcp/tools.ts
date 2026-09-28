// The admin MCP server's tools and what every one of them gets for free: the calling admin, an audit entry per call,
// a per-connection rate limit, and read-only annotations. A tool only declares its input and computes its answer; add
// new ones to MCP_TOOLS.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { McpServer, type AuthInfo, type CallToolResult } from "@modelcontextprotocol/server";
import * as schema from "../db/schema";
import { oauthClients, users } from "../db/schema";
import { audit } from "../audit/record";
import { type McpTool, type McpToolContext } from "./tool";
import { listBingos } from "./tools/listBingos";

type Db = BetterSQLite3Database<typeof schema>;

export const MCP_TOOLS: McpTool[] = [listBingos as unknown as McpTool];

export const RATE_LIMIT = { calls: 60, windowMs: 60_000 };

/** Tool calls per connection in the current window (in memory: one server process). */
const callWindows = new Map<string, { start: number; count: number }>();

/** Whether this connection may make another call now; counts the call if so. */
export function takeRateLimit(connectionId: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const window = callWindows.get(connectionId);
  if (!window || now - window.start >= RATE_LIMIT.windowMs) {
    callWindows.set(connectionId, { start: now, count: 1 });
    // Keeps the map to live windows: an idle connection's entry is only dropped when some connection starts a new one.
    for (const [id, w] of callWindows) if (now - w.start >= RATE_LIMIT.windowMs) callWindows.delete(id);
    return { ok: true };
  }
  if (window.count >= RATE_LIMIT.calls) return { ok: false, retryAfterSeconds: Math.ceil((window.start + RATE_LIMIT.windowMs - now) / 1000) };
  window.count++;
  return { ok: true };
}

export function resetRateLimits(): void {
  callWindows.clear();
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** One MCP server instance for one request, serving MCP_TOOLS as the admin the verified token belongs to. */
export function buildMcpServer(db: Db, authInfo: AuthInfo | undefined, tools: McpTool[] = MCP_TOOLS): McpServer {
  const server = new McpServer(
    { name: "tectonic-bingo", title: "Tectonic Bingo", version: "1.0.0" },
    { instructions: "Read-only data about Tectonic Bingo's Bingos, for site admins balancing future Bingos. Start with list_bingos." },
  );
  const { userId, connectionId } = (authInfo?.extra ?? {}) as { userId?: string; connectionId?: string };

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        // The /mcp route only lets verified tokens through; this guards a server built without one.
        const user = userId ? db.select().from(users).where(eq(users.id, userId)).get() : undefined;
        if (!user?.isAdmin || !authInfo || !connectionId) return errorResult("Only site admins can use these tools.");
        const limit = takeRateLimit(connectionId);
        if (!limit.ok) return errorResult(`Too many tool calls: try again in ${limit.retryAfterSeconds} seconds.`);

        const ctx: McpToolContext = { db, user };
        const clientName = (() => {
          const row = db.select({ metadataJson: oauthClients.metadataJson }).from(oauthClients).where(eq(oauthClients.clientId, authInfo.clientId)).get();
          return row ? ((JSON.parse(row.metadataJson) as { client_name?: string }).client_name ?? null) : null;
        })();
        audit(db, {
          action: "mcp.tool_called",
          bingoId: tool.bingoIdFor?.(args, ctx) ?? null,
          entity: { type: "mcp_tool", id: tool.name, label: tool.name },
          details: { tool: tool.name, arguments: args, clientId: authInfo.clientId, clientName },
          actor: { userId: user.id, type: "user", role: "admin" },
        });

        const result = await tool.run(args, ctx);
        const structured = (Array.isArray(result) ? { items: result } : result) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
      },
    );
  }
  return server;
}
