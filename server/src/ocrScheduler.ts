// The two pieces that keep screenshot OCR from overwhelming the server, kept apart from the OCR engine itself so they
// can be tested without loading a model: a limit on how many recognitions run at once, and a short-lived cache of what
// was read from an image so the same screenshot is never read twice.

export type OcrPriority = "interactive" | "background";

export interface LimiterStats {
  running: number;
  queued: number;
}

/**
 * Runs at most `concurrency` tasks at once and queues the rest. Interactive work (someone is waiting on the screen for
 * the result) always goes ahead of background work, and each queue is first come, first served.
 * `onWait` is told how long a task sat in the queue before it started, but only for tasks that had to wait.
 *
 * A task's `signal` lets its caller withdraw it: work still waiting in the queue is dropped (and rejects with the
 * signal's reason) without ever taking a slot, so an answer nobody is waiting for is never computed. Work that has
 * already started can't be stopped and simply finishes.
 */
export function createLimiter(concurrency: number, onWait?: (info: { waitedMs: number; priority: OcrPriority } & LimiterStats) => void) {
  const limit = Math.max(1, Math.floor(concurrency));
  const queues: Record<OcrPriority, (() => void)[]> = { interactive: [], background: [] };
  let running = 0;

  const stats = (): LimiterStats => ({ running, queued: queues.interactive.length + queues.background.length });

  function pump() {
    while (running < limit) {
      const next = queues.interactive.shift() ?? queues.background.shift();
      if (!next) return;
      next();
    }
  }

  function run<T>(task: () => Promise<T>, priority: OcrPriority = "interactive", signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const queuedAt = Date.now();
      let waited = false;
      const start = () => {
        signal?.removeEventListener("abort", withdraw);
        running++;
        if (waited) onWait?.({ waitedMs: Date.now() - queuedAt, priority, ...stats() });
        // task() may throw synchronously; either way the slot must be released.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            running--;
            pump();
          });
      };
      // Only reachable while still queued: `start` removes this listener the moment the task begins.
      const withdraw = () => {
        const queue = queues[priority];
        const at = queue.indexOf(start);
        if (at === -1) return;
        queue.splice(at, 1);
        reject(signal!.reason);
      };
      signal?.addEventListener("abort", withdraw, { once: true });
      queues[priority].push(start);
      waited = running >= limit;
      pump();
    });
  }

  return { run, stats };
}

/**
 * A bounded, expiring cache in which a value is computed at most once per key: a second request for a key that is
 * still being computed shares the first one's result instead of starting its own. Failures are not remembered, so the
 * next request tries again.
 */
export function createResultCache<T>({ ttlMs, maxEntries, now = Date.now }: { ttlMs: number; maxEntries: number; now?: () => number }) {
  const done = new Map<string, { value: T; expiresAt: number }>();
  const inFlight = new Map<string, Promise<T>>();

  function getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = done.get(key);
    if (hit) {
      if (hit.expiresAt > now()) {
        // Re-insert so the most recently used entries are the last to be evicted.
        done.delete(key);
        done.set(key, hit);
        return Promise.resolve(hit.value);
      }
      done.delete(key);
    }
    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = Promise.resolve()
      .then(compute)
      .then(
        (value) => {
          inFlight.delete(key);
          done.set(key, { value, expiresAt: now() + ttlMs });
          while (done.size > maxEntries) done.delete(done.keys().next().value as string);
          return value;
        },
        (err) => {
          inFlight.delete(key);
          throw err;
        },
      );
    inFlight.set(key, promise);
    return promise;
  }

  return { getOrCompute, size: () => done.size };
}
