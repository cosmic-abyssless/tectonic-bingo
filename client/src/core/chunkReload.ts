// Pages beside the board are their own chunks, loaded on first visit. A deploy replaces every hashed file, so a page
// opened before it asks for a chunk that's gone: reload to get the new build, rather than show the error page. Once per
// minute at most, so a chunk that's really missing ends at the ErrorBoundary instead of reloading forever.
const RELOADED_AT_KEY = "chunk-reload-at";
const MIN_GAP_MS = 60_000;

export function shouldReloadForMissingChunk(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > MIN_GAP_MS;
}

export function installChunkReload(): void {
  window.addEventListener("vite:preloadError", (event) => {
    let lastReloadAt: number | null = null;
    try {
      const stored = sessionStorage.getItem(RELOADED_AT_KEY);
      lastReloadAt = stored === null ? null : Number(stored);
    } catch {
      // Storage blocked: reload anyway; without a record the guard can't hold, but a missing chunk after a deploy is the
      // likely case.
    }
    const now = Date.now();
    if (!shouldReloadForMissingChunk(lastReloadAt, now)) return;
    try {
      sessionStorage.setItem(RELOADED_AT_KEY, String(now));
    } catch {
      // As above.
    }
    event.preventDefault();
    window.location.reload();
  });
}
