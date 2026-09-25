import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AchievementKey } from "@bingo/shared";
import { queryKeys, useMarkAchievementPopupsShown, useMyAchievements } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { useWebSocketEvent } from "../../context/WebSocketContext";
import { useSlot } from "../../themes/context";
import { AchievementUnlockReveal } from "./AchievementUnlockReveal";
import { nextPopupKey } from "./popupQueue";
import { usePageFocused } from "./usePageFocused";

// The popups already started on this page, per bingo and Player. Kept outside React so that nothing — a refetch when
// the Player tabs back in, the host being re-created — can start one twice before the server's record catches up.
const startedPopups = new Map<string, Set<AchievementKey>>();
const startedFor = (slug: string, userId: string) => {
  const id = `${slug}:${userId}`;
  let set = startedPopups.get(id);
  if (!set) startedPopups.set(id, (set = new Set()));
  return set;
};

/**
 * Plays "my Achievements"' unshown unlock popups one at a time, top-centre, above everything (portalled to body,
 * z-[110] — over react-aria dialogs at z-50 and the toast region at z-[60]). Mount only where the viewer is eligible
 * (see AchievementsProvider) — it fetches on mount and keeps up via invalidation, not on a timer.
 *
 * Each popup plays exactly once. It waits to start until the Player is on the page (its tab showing, the window
 * focused), so one earned while they were away is there when they come back; once started it plays through even if
 * they tab away, and it's recorded as shown the moment it starts.
 */
export function AchievementPopupHost({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useMyAchievements(slug, true);
  const markShown = useMarkAchievementPopupsShown(slug);
  const Card = useSlot("AchievementUnlockCard");
  const focused = usePageFocused();
  const [playing, setPlaying] = useState<AchievementKey | null>(null);

  useWebSocketEvent((event) => {
    if (event.type === "achievements_changed" && user && event.payload.userId === user.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.myAchievements(slug) });
    }
  });

  const started = startedFor(slug, user?.id ?? "");
  const next = data ? nextPopupKey(data.unshownPopups, started) : null;

  useEffect(() => {
    if (playing || !next || !focused) return;
    started.add(next);
    setPlaying(next);
    markShown.mutate([next]);
    // markShown and started are stable for this slug and Player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, next, focused]);

  const achievement = playing ? data?.achievements.find((a) => a.key === playing) : undefined;

  // Switched off while it was playing: it's gone from the list, so let the queue move on.
  useEffect(() => {
    if (playing && data && !achievement) setPlaying(null);
  }, [playing, data, achievement]);

  if (!playing || !achievement) return null;
  const done = () => setPlaying(null);

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[110] flex justify-center px-4" role="status" aria-live="polite">
      {/* Keyed by the achievement so a new popup remounts a fresh reveal (and its animation) rather than reusing the old one. */}
      <AchievementUnlockReveal key={playing} onDone={done}>
        <Card
          achievement={achievement}
          onViewAchievements={() => {
            done();
            onOpen();
          }}
        />
      </AchievementUnlockReveal>
    </div>,
    document.body,
  );
}
