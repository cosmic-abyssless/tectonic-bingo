// The OCR service's HTTP surface (the other side of ocrProtocol), kept free of the model so it can be tested with a
// fake reader. ocrServer.ts wires it to the real engine and listens.

import express from "express";
import { log } from "./log";
import { OcrImageError } from "./ocrErrors";
import { OCR_HEALTH_PATH, OCR_PRIORITY_HEADER, OCR_RECOGNIZE_PATH, parseOcrPriority } from "./ocrProtocol";
import type { OcrPriority } from "./ocrScheduler";

export interface OcrAppOptions {
  /** `signal` aborts when the caller hangs up: a reading still waiting its turn should then be dropped, not run. */
  recognize: (image: Buffer, priority: OcrPriority, signal: AbortSignal) => Promise<string[]>;
  /** Whether the model is loaded. /health answers 503 until it is. */
  isReady: () => boolean;
  /** The largest image accepted, in bytes. */
  maxBytes: number;
}

export function createOcrApp({ recognize, isReady, maxBytes }: OcrAppOptions) {
  const app = express();
  app.disable("x-powered-by");

  app.get(OCR_HEALTH_PATH, (_req, res) => {
    const ready = isReady();
    res.status(ready ? 200 : 503).json({ ok: ready });
  });

  app.post(OCR_RECOGNIZE_PATH, express.raw({ type: () => true, limit: maxBytes }), async (req, res) => {
    const image = req.body as unknown;
    if (!Buffer.isBuffer(image) || image.length === 0) {
      res.status(400).json({ error: "An image is required in the request body" });
      return;
    }
    // The API gives up after its timeout and closes the connection. Without this, its abandoned request would still be
    // dequeued and read to the end, and under a burst the queue would never drain.
    const hungUp = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) hungUp.abort();
    });
    try {
      const priority = parseOcrPriority(req.header(OCR_PRIORITY_HEADER));
      const started = Date.now();
      const lines = await recognize(image, priority, hungUp.signal);
      log.info("ocr recognized", { ms: Date.now() - started, bytes: image.length, lines: lines.length, priority });
      res.json({ lines });
    } catch (err) {
      if (hungUp.signal.aborted) {
        log.info("ocr request withdrawn before it was read", { bytes: image.length });
      } else if (err instanceof OcrImageError) {
        // One bad image, not a broken service: say so, so the caller doesn't treat it as an outage and retry.
        log.warn("ocr could not read an image", { err, bytes: image.length });
        res.status(422).json({ error: "The image could not be read" });
      } else {
        log.error("ocr recognition failed", { err, bytes: image.length });
        res.status(500).json({ error: "Recognition failed" });
      }
    }
  });

  // body-parser reports an oversized body as a 413 error; anything else it throws is the client's malformed request.
  app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 413 ? "Image too large" : "Bad request" });
  });

  return app;
}
