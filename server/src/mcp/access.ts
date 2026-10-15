// Who may use the MCP server, and over what (CONTEXT.md "MCP access"): a site admin has every tool over every Bingo;
// a user an Admin gave MCP access has the curated tools over Finished Bingos only (Historical ones are always
// Finished), never run_sql or describe_schema, whose copy of the database holds every Bingo. Everyone else, nothing.
import { can } from "@bingo/shared";
import { siteRoles } from "../services/permissions";

export type McpScope = "all" | "finished";

export function mcpScope(user: { isAdmin: boolean; mcpAccess: boolean }): McpScope | null {
  if (can(siteRoles(user), null, "administer_site").ok) return "all";
  return user.mcpAccess ? "finished" : null;
}

/** Whether a Bingo in this stage is one the scope covers. */
export function scopeCovers(scope: McpScope, stage: string): boolean {
  return scope === "all" || stage === "complete";
}
