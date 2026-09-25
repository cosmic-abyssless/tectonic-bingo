import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AchievementKey } from "@bingo/shared";
import { queryKeys, useMarkAchievementPopupsShown, useMyAchievements } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { useWebSocketEvent } from "../../context/WebSocketContext";
import { useSlot } from "../../themes/context";
import { AchievementUnlockReveal } from "./AchievementUnlockReveal";
import { nextPopupKey } from "./popupQueue";

/**
 * Plays "my Achievements"' unshown unlock popups one at a time, top-centre, above everything (portalled to body,
 * z-[110] — over react-aria dialogs at z-50 and the toast region at z-[60]). Mount only where the viewer is eligible
 * (see AchievementsProvider) — it fetches on mount and keeps polling the cache via invalidation, not on a timer.
 */
export function AchievementPopupHost({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useMyAchievements(slug, true);
  const markShown = useMarkAchievementPopupsShown(slug);
  const Card = useSlot("AchievementUnlockCard");
  // Popups already played this mount: a mid-queue refetch (a websocket event, or another mutation's invalidation)
  // must never replay one while the server hasn't caught up yet.
  const [playedThisSession, setPlayedThisSession] = useState<ReadonlySet<AchievementKey>>(() => new Set());

  useWebSocketEvent((event) => {
    if (event.type === "achievements_changed" && user && event.payload.userId === user.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.myAchievements(slug) });
    }
  });

  if (!data) return null;
  const key = nextPopupKey(data.unshownPopups, playedThisSession);
  const achievement = key ? data.achievements.find((a) => a.key === key) : undefined;
  if (!key || !achievement) return null;

  const finish = () => {
    setPlayedThisSession((prev) => new Set(prev).add(key));
    markShown.mutate([key]);
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[110] flex justify-center px-4" role="status" aria-live="polite">
      {/* Keyed by the achievement so a new popup remounts a fresh reveal (and its animation) rather than reusing the old one. */}
      <AchievementUnlockReveal key={key} onDone={finish}>
        <Card
          achievement={achievement}
          onViewAchievements={() => {
            finish();
            onOpen();
          }}
        />
      </AchievementUnlockReveal>
    </div>,
    document.body,
  );
}
