// The API's side of the OCR boundary: sends an image to the OCR service and gets its text back.

import { ServiceError } from "./services/errors";
import { log } from "./log";
import { OCR_PRIORITY_HEADER, OCR_RECOGNIZE_PATH } from "./ocrProtocol";
import type { OcrPriority } from "./ocrScheduler";

/** The OCR service could not be reached, took too long, or failed. Surfaces as a 503: the site works, analysis doesn't. */
export class OcrUnavailableError extends ServiceError {
  constructor(reason: string) {
    super(503, `Screenshot analysis is temporarily unavailable (${reason})`);
    this.name = "OcrUnavailableError";
  }
}

export interface RemoteRecognizerOptions {
  url: string;
  timeoutMs: number;
  /** Replaceable in tests. */
  fetchImpl?: typeof fetch;
}

export function createRemoteRecognizer({ url, timeoutMs, fetchImpl = fetch }: RemoteRecognizerOptions) {
  return async function recognizeRemotely(buffer: Buffer, priority: OcrPriority): Promise<string[]> {
    let response: Response;
    try {
      response = await fetchImpl(`${url}${OCR_RECOGNIZE_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", [OCR_PRIORITY_HEADER]: priority },
        body: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      const reason = timedOut ? `no answer within ${timeoutMs} ms` : "the OCR service could not be reached";
      log.warn("ocr service call failed", { err, url, timedOut });
      throw new OcrUnavailableError(reason);
    }

    if (!response.ok) {
      log.warn("ocr service returned an error", { status: response.status, url });
      // The image itself was refused (empty, too large): retrying or waiting won't help, so it is not "unavailable".
      if (response.status === 400 || response.status === 413) throw new ServiceError(response.status, "The screenshot could not be analysed");
      throw new OcrUnavailableError(`the OCR service answered ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new OcrUnavailableError("the OCR service sent an unreadable answer");
    }
    const lines = (body as { lines?: unknown } | null)?.lines;
    if (!Array.isArray(lines) || !lines.every((line) => typeof line === "string")) {
      throw new OcrUnavailableError("the OCR service sent an unexpected answer");
    }
    return lines;
  };
}
