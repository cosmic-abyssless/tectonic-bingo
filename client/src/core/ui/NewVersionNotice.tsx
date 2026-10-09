import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { getServerBuild, subscribeServerBuild, versionAction } from "../../api/serverBuild";
import { Button } from "./Button";
import { AlertIcon } from "./icons";
import { toastQueue } from "./Toast";

// A forced reload waits at random within this range, per page: a deploy's open pages all hear of it at once, and
// reloading together would pull the bundle and every page's queries through the server in the same few seconds.
const FORCE_DELAY_MIN_MS = 10_000;
const FORCE_DELAY_MAX_MS = 60_000;

/** How long a page waits before a forced reload, for `random` in [0, 1). */
export function forceReloadDelayMs(random: () => number): number {
  return FORCE_DELAY_MIN_MS + random() * (FORCE_DELAY_MAX_MS - FORCE_DELAY_MIN_MS);
}

const TITLE = "A new version of the site is out";
const reload = () => window.location.reload();

/**
 * Site-wide: when the server serves a newer build than this page's (api/serverBuild.ts), a toast offers a reload, once
 * per new build (closing it dismisses that build). When the server forces it (FORCE_CLIENT_RELOAD), the page reloads at
 * its next navigation, or after a notice of 10 to 60 seconds (forceReloadDelayMs), never without one: that notice is its
 * own, not a toast, so it can't wait unseen in the toast queue behind others while the seconds run.
 */
export function NewVersionNotice() {
  const server = useSyncExternalStore(subscribeServerBuild, getServerBuild);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const action = versionAction(__BUILD_ID__, server, dismissed, !import.meta.env.DEV);
  const newBuildId = action === "none" ? null : server!.buildId;

  useEffect(() => {
    if (action !== "prompt" || !newBuildId) return;
    let closedHere = false;
    const key = toastQueue.add(
      { title: TITLE, description: "Reload to get it.", tone: "info", action: { label: "Reload", onPress: reload } },
      { onClose: () => !closedHere && setDismissed(newBuildId) },
    );
    return () => {
      closedHere = true;
      toastQueue.close(key);
    };
  }, [action, newBuildId]);

  useEffect(() => {
    if (action !== "force") return;
    // Chosen once, as the notice appears.
    const timer = setTimeout(reload, forceReloadDelayMs(Math.random));
    return () => clearTimeout(timer);
  }, [action]);

  // Forced, the next navigation reloads into the new build, at the page navigated to.
  const location = useLocation();
  const forcedAt = useRef<string | null>(null);
  useEffect(() => {
    if (action !== "force") {
      forcedAt.current = null;
      return;
    }
    if (forcedAt.current === null) forcedAt.current = location.key;
    else if (forcedAt.current !== location.key) reload();
  }, [action, location.key]);

  if (action !== "force") return null;
  // Shown the moment the timer starts: above everything, dialogs included, and React Aria's top layer so an open dialog
  // neither blocks it nor closes on a click on it (as AchievementPopupHost).
  return createPortal(
    <div data-react-aria-top-layer="true" className="pointer-events-none fixed inset-x-0 bottom-4 z-[10000] flex justify-center px-4">
      <div role="alert" className="pointer-events-auto flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-outline bg-surface-raised p-3 pl-4 shadow-pop">
        <AlertIcon className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-surface">{TITLE}</p>
          <p className="mt-0.5 text-sm text-on-surface-muted">This page reloads in about a minute to get it.</p>
          <Button size="sm" variant="secondary" className="mt-2" onPress={reload}>
            Reload now
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
