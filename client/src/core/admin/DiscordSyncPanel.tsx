import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bingo, DiscordSyncStatus } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { ExternalLink } from "../ui/ExternalLink";
import { timeAgo } from "../ui/time";

/**
 * The Discord team sync's state (server/src/services/discordTeamService.ts): why it isn't syncing if it isn't, each
 * Team's channels as links into Discord, Sync now (which also puts back anything changed or deleted by hand in
 * Discord) and Remove from Discord.
 */
export function DiscordSyncPanel({ slug, bingo, onRemoved }: { slug: string; bingo: Bingo; /** The sync was turned off: the form's switch follows. */ onRemoved: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DiscordSyncStatus | null>(null);
  const [busy, setBusy] = useState<"sync" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await adminApi.getDiscordStatus(slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the Discord status.");
    }
  }, [slug]);
  // Reloaded whenever the bingo changes (a save, a stage change, a sync finishing in the background).
  useEffect(() => void load(), [load, bingo]);

  async function run(kind: "sync" | "remove") {
    if (kind === "remove" && !confirm("Delete every Discord role and channel made for this bingo's teams, and turn the sync off? Their messages are lost.")) return;
    setBusy(kind);
    setError(null);
    setRemoved(null);
    try {
      if (kind === "sync") {
        setStatus((await adminApi.syncDiscord(slug)).status);
      } else {
        const result = await adminApi.removeDiscord(slug);
        setStatus(result.status);
        setRemoved(result.deleted);
        onRemoved();
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "It didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const channelLink = (channelId: string | null, label: string) =>
    channelId && status?.guildId ? <ExternalLink href={`https://discord.com/channels/${status.guildId}/${channelId}`}>{label}</ExternalLink> : <span className="text-on-surface-subtle">not made yet</span>;

  return (
    <div className="space-y-3">
      {status?.blocker && <Notice tone="neutral">Not syncing: {status.blocker}</Notice>}
      {bingo.discordSyncError && <Notice tone="warn">Last Discord sync failed: {bingo.discordSyncError}</Notice>}
      {!bingo.discordSyncError && bingo.discordSyncedAt && <p className="text-sm text-on-surface-muted">Last synced {timeAgo(bingo.discordSyncedAt)}.</p>}

      {status && status.teams.length > 0 && status.resourceCount > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-on-surface-muted">
            <tr>
              <th className="py-1 font-medium">Team</th>
              <th className="py-1 font-medium">Role</th>
              <th className="py-1 font-medium">Channels</th>
            </tr>
          </thead>
          <tbody>
            {status.teams.map((t) => (
              <tr key={t.teamId} className="border-t border-outline">
                <td className="py-1.5 text-on-surface">{t.teamName}</td>
                <td className="py-1.5">{t.roleId ? <span className="num">{t.roleId}</span> : <span className="text-on-surface-subtle">not made yet</span>}</td>
                <td className="space-x-3 py-1.5">
                  {channelLink(t.textChannelId, "text")}
                  {t.voiceChannelId && channelLink(t.voiceChannelId, "voice")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Saved settings only: the sync reads the bingo, not this form. */}
        <Button onPress={() => run("sync")} isDisabled={busy !== null || !!status?.blocker}>
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
        {status && status.resourceCount > 0 && (
          <Button variant="danger" onPress={() => run("remove")} isDisabled={busy !== null}>
            {busy === "remove" ? "Removing…" : "Remove from Discord"}
          </Button>
        )}
      </div>
      {removed !== null && <Notice tone="ok">Removed {removed} Discord roles and channels, and turned the sync off.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
