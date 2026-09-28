import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { McpConnection } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useMcpConnections } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { timeAgo } from "../ui/time";
import { avatarUrl, displayName } from "../ui/user";

/**
 * Claude connections to the admin MCP server (#293), each with a Revoke button: "mine" is the signed-in Admin's own
 * (Connected apps in the account menu), "all" is every Admin's (Site admin > Claude connections, Site Admins only).
 * Revoking stops the connection's tokens straight away; Claude has to be connected again to get back in.
 */
export function McpConnectionsList({ scope }: { scope: "mine" | "all" }) {
  const { data, isLoading, error } = useMcpConnections(scope);
  if (isLoading) return <p className="text-sm text-on-surface-subtle">Loading…</p>;
  if (error) return <Notice tone="danger">{error instanceof Error ? error.message : "Couldn't load connections"}</Notice>;
  const connections = data?.connections ?? [];
  if (connections.length === 0) {
    return <p className="text-sm text-on-surface-subtle">{scope === "mine" ? "You haven't connected Claude." : "No admin has connected Claude."}</p>;
  }
  return (
    <ul className="divide-y divide-outline rounded-md border border-outline">
      {connections.map((c) => (
        <ConnectionRow key={c.id} connection={c} showOwner={scope === "all"} />
      ))}
    </ul>
  );
}

function ConnectionRow({ connection, showOwner }: { connection: McpConnection; showOwner: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await adminApi.revokeMcpConnection(connection.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpConnections("mine") }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpConnections("all") }),
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke the connection");
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        {showOwner && <img src={avatarUrl(connection.user)} alt="" className="size-7 shrink-0 rounded-full" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-on-surface">
            {showOwner ? `${displayName(connection.user)} · ` : ""}
            {connection.clientName}
            {connection.redirectHost && <span className="font-normal text-on-surface-muted"> ({connection.redirectHost})</span>}
          </div>
          <div className="text-xs text-on-surface-muted">
            Connected {new Date(connection.connectedAt).toLocaleDateString()} · last used {timeAgo(connection.lastUsedAt)}
          </div>
        </div>
        {!confirming && (
          <Button variant="ghost" size="sm" className="shrink-0 text-danger" onPress={() => setConfirming(true)}>
            Revoke
          </Button>
        )}
      </div>
      {confirming && (
        <Notice tone="danger" className="space-y-2">
          <p>
            Revoke {showOwner ? `${displayName(connection.user)}'s ` : "this "}
            {connection.clientName} connection? It stops working straight away, and Claude has to be connected again to get back in.
          </p>
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
