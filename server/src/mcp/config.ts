// Where the admin MCP server lives, for the OAuth documents and the token audience (docs: #289, #290).
//
// The site's own origin, from MCP_PUBLIC_URL or else CLIENT_URL (the same origin in production, where the server
// serves the client). The authorization server's issuer is that origin, and the protected resource is <origin>/mcp:
// Claude requires a token's `resource` to match it exactly.

export const MCP_SCOPE = "bingo:read";

export interface McpUrls {
  /** The authorization server's issuer, e.g. https://tectonic.bingo/ */
  issuer: URL;
  /** The canonical MCP endpoint, e.g. https://tectonic.bingo/mcp: every token's audience. */
  resource: URL;
}

export function mcpUrls(env: Record<string, string | undefined> = process.env): McpUrls {
  const base = env.MCP_PUBLIC_URL || env.CLIENT_URL;
  if (!base) throw new Error("MCP_PUBLIC_URL or CLIENT_URL must be set for the MCP server");
  const origin = new URL(base).origin;
  return { issuer: new URL(`${origin}/`), resource: new URL(`${origin}/mcp`) };
}
