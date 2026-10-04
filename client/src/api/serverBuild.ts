// Which build the server serves (#455), as it announces it on every API response (X-Build-Id, read in api/client.ts)
// and in its socket's hello (WebSocketContext). A page from another build offers a reload, or reloads when the server
// forces it (core/ui/NewVersionNotice).

export interface ServerBuild {
  buildId: string;
  forceReload: boolean;
}

let latest: ServerBuild | null = null;
const listeners = new Set<() => void>();

export function noteServerBuild(build: ServerBuild): void {
  if (latest?.buildId === build.buildId && latest.forceReload === build.forceReload) return;
  latest = build;
  for (const listener of listeners) listener();
}

export function getServerBuild(): ServerBuild | null {
  return latest;
}

export function subscribeServerBuild(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What the page does about the server's build: nothing, offer a reload, or reload (forced). */
export type VersionAction = "none" | "prompt" | "force";

/**
 * `own` is the page's build (__BUILD_ID__), `dismissed` the new build whose prompt was dismissed. Off in development
 * (`enabled` false), where the dev server's client is never a build the server announces.
 */
export function versionAction(own: string, server: ServerBuild | null, dismissed: string | null, enabled: boolean): VersionAction {
  if (!enabled || !server || server.buildId === own) return "none";
  if (server.forceReload) return "force";
  return dismissed === server.buildId ? "none" : "prompt";
}
