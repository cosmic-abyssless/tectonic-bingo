// Reading the text in a screenshot, wherever the reading actually happens. The cache lives here, in the API, so the
// analysis done when someone picks a screenshot in the submission modal is reused by the analysis of the submission
// that follows, without another trip to the OCR engine.

import { createHash } from "node:crypto";
import { log } from "./log";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { createResultCache, type OcrPriority } from "./ocrScheduler";

export type TextRecognizer = (image: Buffer, priority: OcrPriority) => Promise<string[]>;

/**
 * Reads with `primary`, and with `fallback` whenever `primary` fails, for any reason: an outage or a refused key, but
 * also an image it wouldn't take, which the other engine may still read. What `fallback` throws is what the caller sees.
 *
 * Each failure is logged here, once, at the level it asks for: an error (so Sentry hears) when someone has to act, a
 * warning otherwise. A transient failure (a timeout, over quota, the provider down) also skips `primary` for
 * `cooldownMs`, so during an outage each screenshot goes straight to `fallback` instead of waiting out `primary`'s
 * timeout first; that is logged once as it starts, and once more when `primary` reads again.
 */
export function withFallback(
  primary: TextRecognizer,
  fallback: TextRecognizer,
  names: { primary: string; fallback: string },
  opts: { cooldownMs: number; now?: () => number } = { cooldownMs: 60_000 },
): TextRecognizer {
  const now = opts.now ?? (() => Date.now());
  let skipUntil = 0;
  let skipping = false;
  return async (image, priority) => {
    if (now() < skipUntil) return fallback(image, priority);
    try {
      const lines = await primary(image, priority);
      if (skipping) {
        skipping = false;
        log.info(`${names.primary} reads screenshots again`);
      }
      return lines;
    } catch (err) {
      if (err instanceof OcrUnavailableError && err.transient) {
        skipUntil = now() + opts.cooldownMs;
        if (!skipping) log.warn(`${names.primary} failed, so ${names.fallback} reads screenshots for the next ${Math.round(opts.cooldownMs / 1000)} s`, { err, detail: err.detail });
        skipping = true;
      } else if (err instanceof OcrUnavailableError || err instanceof OcrImageError) {
        const needsAttention = err instanceof OcrUnavailableError && err.needsAttention;
        log[needsAttention ? "error" : "warn"](`${names.primary} failed, reading the screenshot with ${names.fallback}`, {
          err,
          detail: err instanceof OcrUnavailableError ? err.detail : undefined,
        });
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
