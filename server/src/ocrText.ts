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
 */
export function withFallback(primary: TextRecognizer, fallback: TextRecognizer, names: { primary: string; fallback: string }): TextRecognizer {
  return async (image, priority) => {
    try {
      return await primary(image, priority);
    } catch (err) {
      // An outage or a refused image is expected now and then (the reader has logged what needs a person); anything
      // else is a bug in the reader, and reaches Sentry.
      const expected = err instanceof OcrUnavailableError || err instanceof OcrImageError;
      log[expected ? "warn" : "error"](`${names.primary} failed, reading the screenshot with ${names.fallback}`, { err });
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
