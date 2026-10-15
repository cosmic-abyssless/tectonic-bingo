import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useMcpAccessUsers } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { avatarUrl, displayName } from "../ui/user";
import { UserSearchInput } from "./UserSearchInput";

/**
 * Site admin > MCP access (CONTEXT.md "MCP access"): who may connect Claude to the MCP server without being a site
 * admin, over Finished Bingos only. Any Admin grants it from the search and revokes it on each row. Grants and revokes
 * broadcast access_changed, which refetches the list in every open copy (WebSocketContext).
 */
export function McpAccessPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMcpAccessUsers();
  const [grantError, setGrantError] = useState<string | null>(null);

  async function grant(user: User) {
    setGrantError(null);
    try {
      await adminApi.setUserMcpAccess(user.id, true);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpAccess });
    } catch (e: unknown) {
      setGrantError(e instanceof Error ? e.message : "Failed to grant MCP access");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-on-surface-muted">
        People with MCP access can connect Claude to Tectonic Bingo without being site admins. Claude can then read Finished Bingos, Historical ones included,
        through the curated tools: never a Bingo that isn't Finished, and never the raw SQL tool. Site admins have the full server anyway.
      </p>
      <div className="max-w-md space-y-2">
        <UserSearchInput scope="site" onSelect={grant} placeholder="Grant MCP access: search by Discord username…" />
        {grantError && <Notice tone="danger">{grantError}</Notice>}
      </div>
      {isLoading ? (
        <p className="text-sm text-on-surface-subtle">Loading…</p>
      ) : error ? (
        <Notice tone="danger">{error instanceof Error ? error.message : "Couldn't load who has MCP access"}</Notice>
      ) : data?.users.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">Nobody has MCP access yet.</p>
      ) : (
        <ul aria-label="MCP access" className="divide-y divide-outline rounded-md border border-outline">
          {data?.users.map((user) => (
            <AccessRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AccessRow({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await adminApi.setUserMcpAccess(user.id, false);
      // Their Claude connections went with it, unless they're a site admin.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpAccess }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpConnections("all") }),
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke MCP access");
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <img src={avatarUrl(user)} alt="" className="size-7 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-on-surface">{displayName(user)}</div>
          <div className="truncate text-xs text-on-surface-muted">{user.discordUsername}</div>
        </div>
        {!confirming && (
          <Button variant="ghost" size="sm" className="shrink-0 text-danger" onPress={() => setConfirming(true)}>
            Revoke
          </Button>
        )}
      </div>
      {confirming && (
        <Notice tone="danger" className="space-y-2">
          <p>Revoke {displayName(user)}'s MCP access? It also ends all of their Claude connections; they'd have to connect again if it's granted back.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onPress={() => setConfirming(false)} isDisabled={revoking}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onPress={revoke} isDisabled={revoking}>
              {revoking ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </li>
  );
}
