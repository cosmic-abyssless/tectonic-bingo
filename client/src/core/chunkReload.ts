// Pages beside the board are their own chunks, loaded on first visit. A deploy replaces every hashed file, so a page
// opened before it asks for a chunk that's gone: reload to get the new build, rather than show the error page. Once per
// minute at most, so a chunk that's really missing ends at the ErrorBoundary instead of reloading forever.
const RELOADED_AT_KEY = "chunk-reload-at";
const MIN_GAP_MS = 60_000;

export function shouldReloadForMissingChunk(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > MIN_GAP_MS;
}

/**
 * Wrap every dynamic import in this. When its chunk is missing, the handler below reloads the page and suppresses
 * Vite's error (event.preventDefault()), and Vite then resolves the import with undefined instead of the module. Read
 * from that, a page's code throws ("Cannot read properties of undefined") in the moment before the reload, which shows
 * the error page or reaches Sentry as a bug. This waits for the reload instead.
 */
export function awaitModule<T>(load: Promise<T>): Promise<T> {
  return load.then((module) => (module === undefined ? new Promise<T>(() => {}) : module));
}

export function installChunkReload(reload: () => void = () => window.location.reload()): void {
  // One missing chunk rarely comes alone: an import's JS and CSS, or the theme and the page beside it, fail together.
  // Once this page is reloading, every later failure is suppressed too: by the minute's guard it would be thrown, and
  // reach the ErrorBoundary or Sentry ("Importing a module script failed") in the moment before the reload.
  let reloading = false;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloading) {
      event.preventDefault();
      return;
    }
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
    reloading = true;
    event.preventDefault();
    reload();
  });
}
