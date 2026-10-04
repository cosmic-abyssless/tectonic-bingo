import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { getServerBuild, subscribeServerBuild, versionAction } from "../../api/serverBuild";
import { toastQueue } from "./Toast";

const FORCE_DELAY_MS = 10_000;
const TITLE = "A new version of the site is out";
const reload = () => window.location.reload();

/**
 * Site-wide: when the server serves a newer build than this page's (api/serverBuild.ts), a toast offers a reload, once
 * per new build (closing it dismisses that build). When the server forces it (FORCE_CLIENT_RELOAD), the page reloads at
 * its next navigation, or after a 10-second notice, never without one. Renders nothing itself.
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
    const key = toastQueue.add({ title: TITLE, description: "This page reloads in 10 seconds to get it.", tone: "warning", action: { label: "Reload now", onPress: reload } });
    const timer = setTimeout(reload, FORCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      toastQueue.close(key);
    };
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

  return null;
}
