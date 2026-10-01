import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useSiteAdmins } from "../../api/adminQueries";
import { useSiteCan } from "../../headless/permissions";
import { Button } from "../ui/Button";
import { Badge, Notice } from "../ui/Card";
import { avatarUrl, displayName } from "../ui/user";
import { UserSearchInput } from "./UserSearchInput";

/**
 * Site admin > Site admins (#413): the Owners (ADMIN_DISCORD_IDS), who can't be revoked, then every other site admin.
 * Every Admin sees the list; only Owners (manage_site_admins) get the Grant search and a Revoke on each site admin.
 * Grants and revokes broadcast access_changed, which refetches the list in every open copy (WebSocketContext).
 */
export function SiteAdminsPanel() {
  const manage = useSiteCan("manage_site_admins").allowed;
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useSiteAdmins();
  const [grantError, setGrantError] = useState<string | null>(null);

  async function grant(user: User) {
    setGrantError(null);
    try {
      await adminApi.setUserAdmin(user.id, true);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.siteAdmins });
    } catch (e: unknown) {
      setGrantError(e instanceof Error ? e.message : "Failed to grant admin");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-on-surface-muted">
        Site admins can create bingos and edit any board. Owners are the site admins listed in ADMIN_DISCORD_IDS: only they grant and revoke site admin, and
        they can't be revoked here.
      </p>
      {manage && (
        <div className="max-w-md space-y-2">
          <UserSearchInput scope="site" onSelect={grant} placeholder="Grant site admin: search by Discord username…" />
          {grantError && <Notice tone="danger">{grantError}</Notice>}
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-on-surface-subtle">Loading…</p>
      ) : error ? (
        <Notice tone="danger">{error instanceof Error ? error.message : "Couldn't load the site admins"}</Notice>
      ) : (
        <ul aria-label="Site admins" className="divide-y divide-outline rounded-md border border-outline">
          {data?.owners.map((owner) => (
            <li key={owner.discordId} className="flex items-center gap-3 px-3 py-2.5">
              <img src={avatarUrl(owner.user ?? { discordId: owner.discordId, discordAvatar: null })} alt="" className="size-7 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                {owner.user ? (
                  <Name user={owner.user} />
                ) : (
                  <>
                    <div className="truncate text-sm font-medium text-on-surface-muted">Not signed in yet</div>
                    <div className="truncate text-xs text-on-surface-muted">Discord id {owner.discordId}</div>
                  </>
                )}
              </div>
              <Badge tone="info">Owner</Badge>
            </li>
          ))}
          {data?.admins.map((admin) => <AdminRow key={admin.id} user={admin} canRevoke={manage} />)}
        </ul>
      )}
    </div>
  );
}

function Name({ user }: { user: User }) {
  return (
    <>
      <div className="truncate text-sm font-medium text-on-surface">{displayName(user)}</div>
      <div className="truncate text-xs text-on-surface-muted">{user.discordUsername}</div>
    </>
  );
}

function AdminRow({ user, canRevoke }: { user: User; canRevoke: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await adminApi.setUserAdmin(user.id, false);
      // Their Claude connections went with it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.siteAdmins }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpConnections("all") }),
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke site admin");
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <img src={avatarUrl(user)} alt="" className="size-7 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Name user={user} />
        </div>
        {canRevoke && !confirming && (
          <Button variant="ghost" size="sm" className="shrink-0 text-danger" onPress={() => setConfirming(true)}>
            Revoke
          </Button>
        )}
      </div>
      {confirming && (
        <Notice tone="danger" className="space-y-2">
          <p>Revoke {displayName(user)}'s site admin? It also ends all of their Claude connections; they'd have to connect again if it's granted back.</p>
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
