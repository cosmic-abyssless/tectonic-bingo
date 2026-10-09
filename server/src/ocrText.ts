// Reading the text in a screenshot, wherever the reading actually happens. The cache lives here, in the API, so the
// analysis done when someone picks a screenshot in the submission modal is reused by the analysis of the submission
// that follows, without another trip to the OCR engine.

import { createHash } from "node:crypto";
import { log } from "./log";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { createResultCache, type OcrPriority } from "./ocrScheduler";

export type TextRecognizer = (image: Buffer, priority: OcrPriority) => Promise<string[]>;

/**
 * Thrown by a `primary` reading that was waiting for its turn (behind a limiter) when the cooldown below opened: it
 * gives way to the fallback without calling the provider, and without counting as a failure.
 */
export class SkippedForCooldown extends Error {
  constructor() {
    super("skipped while the cooldown is on");
    this.name = "SkippedForCooldown";
  }
}

/** A reader that can tell, as its reading actually starts, whether to give way (SkippedForCooldown). */
export type FallbackPrimary = (image: Buffer, priority: OcrPriority, skipping: () => boolean) => Promise<string[]>;

/**
 * Reads with `primary`, and with `fallback` whenever `primary` fails, for any reason: an outage or a refused key, but
 * also an image it wouldn't take, which the other engine may still read. What `fallback` throws is what the caller sees.
 *
 * A failure that will last (a timeout, over quota, the provider down, or a refused key) skips `primary` for
 * `cooldownMs`, so each screenshot goes straight to `fallback` instead of paying `primary`'s round trip (or its timeout)
 * first, and `primary` is tried again once the cooldown ends. Readings already queued inside `primary` when it opens
 * see it through `skipping` and give way too. It is logged as it starts, at the level it asks for (an error, so Sentry
 * hears, when someone has to act: a refused key), again if the reason changes or every `relogMs` while it lasts, and
 * once when `primary` reads again. Only a reading that started after the failure ends it: one already under way proves
 * little in a partial outage, where some readings succeed and some time out. Any other failure (one image) is logged
 * and read with `fallback` on its own.
 */
export function withFallback(
  primary: FallbackPrimary,
  fallback: TextRecognizer,
  names: { primary: string; fallback: string },
  opts: { cooldownMs: number; relogMs?: number; now?: () => number } = { cooldownMs: 60_000 },
): TextRecognizer {
  const now = opts.now ?? (() => Date.now());
  const relogMs = opts.relogMs ?? 60 * 60_000;
  let skipUntil = 0;
  const skipping = () => now() < skipUntil;
  // When the last lasting failure happened: a reading that started before it can't end the cooldown.
  let failedAt = -Infinity;
  // Why `primary` is being skipped, if it is: said once per reason, so an outage that turns into a refused key is still
  // reported (and to Sentry) rather than swallowed by the outage's "said so already".
  let skippingFor: "outage" | "refused" | null = null;
  let loggedAt = -Infinity;
  return async (image, priority) => {
    if (skipping()) return fallback(image, priority);
    const startedAt = now();
    try {
      const lines = await primary(image, priority, skipping);
      if (startedAt >= failedAt) {
        skipUntil = 0;
        if (skippingFor) {
          skippingFor = null;
          log.info(`${names.primary} reads screenshots again`);
        }
      }
      return lines;
    } catch (err) {
      if (err instanceof SkippedForCooldown) return fallback(image, priority);
      if (err instanceof OcrUnavailableError && (err.transient || err.needsAttention)) {
        skipUntil = now() + opts.cooldownMs;
        failedAt = now();
        const reason = err.needsAttention ? "refused" : "outage";
        if (skippingFor !== reason || now() - loggedAt >= relogMs) {
          loggedAt = now();
          log[err.needsAttention ? "error" : "warn"](`${names.primary} failed, so ${names.fallback} reads screenshots for the next ${Math.round(opts.cooldownMs / 1000)} s`, {
            err,
            detail: err.detail,
          });
        }
        skippingFor = reason;
      } else if (err instanceof OcrUnavailableError || err instanceof OcrImageError) {
        log.warn(`${names.primary} failed, reading the screenshot with ${names.fallback}`, { err, detail: err instanceof OcrUnavailableError ? err.detail : undefined });
      } else {
        // Not a failure any reader means to throw: a bug, so it reaches Sentry.
        log.error(`${names.primary} failed unexpectedly, reading the screenshot with ${names.fallback}`, { err });
      }
      return fallback(image, priority);
    }
  };
}

export function createTextReader(recognize: TextRecognizer, cacheOptions: { ttlMs: number; maxEntries: number; now?: () => number } = { ttlMs: 15 * 60_000, maxEntries: 200 }): TextRecognizer {
  // What was read from an image, keyed by its bytes. Only the text is kept: matching it against the codeword and
  // board is cheap. A failed reading is not remembered, so the next request tries again.
  const cache = createResultCache<string[]>(cacheOptions);
  return (image, priority) => {
    const key = createHash("sha256").update(image).digest("hex");
    return cache.getOrCompute(key, () => recognize(image, priority));
  };
}
