// Reading the text in a screenshot, wherever the reading actually happens. The cache lives here, in the API, so the
// analysis done when someone picks a screenshot in the submission modal is reused by the analysis of the submission
// that follows, without another trip to the OCR engine.

import { createHash } from "node:crypto";
import { createResultCache, type OcrPriority } from "./ocrScheduler";

export type TextRecognizer = (image: Buffer, priority: OcrPriority) => Promise<string[]>;

export function createTextReader(recognize: TextRecognizer, cacheOptions: { ttlMs: number; maxEntries: number; now?: () => number } = { ttlMs: 15 * 60_000, maxEntries: 200 }): TextRecognizer {
  // What was read from an image, keyed by its bytes. Only the text is kept: matching it against the codeword and
  // board is cheap. A failed reading is not remembered, so the next request tries again.
  const cache = createResultCache<string[]>(cacheOptions);
  return (image, priority) => {
    const key = createHash("sha256").update(image).digest("hex");
    return cache.getOrCompute(key, () => recognize(image, priority));
  };
}
