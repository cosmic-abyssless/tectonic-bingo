// The OCR engine itself: the model, the limit on how many screenshots are read at once, and the warm-up. Only the
// process that actually reads images loads this (the API in local development, the `ocr` container in production), so
// nothing else imports it eagerly: see ocr.ts.

import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
import { log } from "./log";
import { ocrConcurrency, ocrThreads } from "./ocrConfig";
import { OcrImageError } from "./ocrErrors";
import { createLimiter, type OcrPriority } from "./ocrScheduler";

// Lazy singleton: initialize() is ~1.6s warm (longer on the very first call,
// which also downloads and caches the model), so this must happen once and
// never per-request. In production warmOcr() does it in the background right
// after the process starts; elsewhere (a tsx-watch restart loop shouldn't pay
// that cost or hit the network) it waits for the first screenshot.
let _service: Promise<PaddleOcrService> | null = null;
let ready = false;

// Recognition is CPU-bound, so an unbounded burst of submissions would make every one of them slow. Cap how many run
// at once and queue the rest. The limit is OCR_CONCURRENCY (default 5, see ocrConfig).
const limiter = createLimiter(ocrConcurrency(), ({ waitedMs, priority, running, queued }) => {
  log.info("ocr waited for a free slot", { waitedMs, priority, running, queued });
});

// Exported so scripts/ocr-smoke.ts uses the exact same tuned options as
// production rather than the library's defaults, which drift silently
// otherwise (that drift is how the maxSideLength bug above went unnoticed).
export function getOcrService(): Promise<PaddleOcrService> {
  if (!_service) {
    _service = (async () => {
      const service = new PaddleOcrService({
        model: V6_SMALL_MODEL,
        // The library's default "auto" cap (clamp(0.75 * longestSide, 960,
        // 1920)) shrinks a real full-client RuneLite screenshot enough to
        // drop entire chatbox lines outright — confirmed against a real
        // 1500px-wide screenshot where "auto" silently dropped 4 of 9 chat
        // lines and a fixed higher cap recovered all of them. Real
        // screenshots aren't the tightly-cropped benchmark images this
        // model was tuned against, so don't downscale them.
        detection: { maxSideLength: 4000 },
        // charactersDictionary is typed as required here, but the library
        // always overwrites it with the loaded dict during initialize() —
        // confirmed by reading paddle-ocr.service.js. `[]` matches the
        // library's own DEFAULT_RECOGNITION_OPTIONS placeholder.
        //
        // strategy: "per-box" overrides the library default ("per-line",
        // which merges same-line boxes before recognizing). On a real
        // screenshot that merge corrupted adjacent text — e.g. a UI label
        // "frost-wyvern 03/09/2026 21:08 UTC" came out as "rost-uyer
        // 03/09/20e26 2" / "1.08 UT" under per-line, but recognized exactly
        // right (0.94-0.99 confidence per box) under per-box. A/B against
        // the same real screenshot showed per-box was more accurate on
        // nearly every line (not just this one), with no measurable
        // latency cost for a screenshot-sized image.
        recognition: { maxCropSourceSideLength: 4000, charactersDictionary: [], strategy: "per-box" },
        // One thread per CPU this process may use, not per CPU of the host: see ocrThreads.
        session: { intraOpNumThreads: ocrThreads(), interOpNumThreads: 1 },
      });
      await service.initialize();
      ready = true;
      return service;
    })().catch((err) => {
      // A failed load (the model download timing out, say) must not be remembered: the next call tries again
      // instead of every screenshot failing until the process restarts.
      _service = null;
      throw err;
    });
  }
  return _service;
}

/** Whether the model is loaded and the next screenshot will not wait for it. */
export function isOcrReady(): boolean {
  return ready;
}

/**
 * Loads the model ahead of the first screenshot so nobody's submission pays for it. A failure is logged and reported as
 * `false`; the first real request tries again (the API process), or the caller exits so the container is restarted
 * (the `ocr` service, see ocrServer.ts).
 */
export async function warmOcrEngine(): Promise<boolean> {
  const started = Date.now();
  try {
    await getOcrService();
    log.info("ocr model ready", { ms: Date.now() - started, concurrency: ocrConcurrency(), threads: ocrThreads() });
    return true;
  } catch (err) {
    log.error("ocr warm-up failed", { err });
    return false;
  }
}

// A Buffer is a view into a shared, larger ArrayBuffer pool — `buf.buffer`
// alone hands the OCR library unrelated memory. Slice to the view's own range.
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Reads the text in an image, one string per line, waiting its turn behind the concurrency limit. Aborting `signal`
 * withdraws the request if it is still waiting. A model that can't be loaded rejects as-is (the engine is unavailable);
 * an image the loaded model can't read rejects with an OcrImageError (this image is the problem).
 */
export function recognizeLocally(buffer: Buffer, priority: OcrPriority, signal?: AbortSignal): Promise<string[]> {
  return limiter.run(
    async () => {
      const service = await getOcrService();
      let result;
      try {
        // noCache: the library's own cache is tiny and keyed differently; the text cache in ocr.ts is what dedupes.
        result = await service.recognize(toArrayBuffer(buffer), { noCache: true });
      } catch (err) {
        throw new OcrImageError(err);
      }
      return result.text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    },
    priority,
    signal,
  );
}
