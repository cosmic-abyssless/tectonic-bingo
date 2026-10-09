// Reading a screenshot with Google Cloud Vision (TEXT_DETECTION): the first reader when GOOGLE_VISION_API_KEY is set,
// with the local engine (the OCR service, or this process) as its fallback (ocr.ts). Measured on the Historical Bingo's
// screenshots it is about five times faster than the local engine and misreads less (issue #485,
// scripts/ocr-compare.ts).

import { log } from "./log";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

// google.rpc.Code.INVALID_ARGUMENT: what Cloud Vision answers for one image it can't read ("Bad image data").
const INVALID_ARGUMENT = 3;

export interface GoogleVisionOptions {
  apiKey: string;
  timeoutMs: number;
  /** Replaceable in tests. */
  fetchImpl?: typeof fetch;
}

interface AnnotateResponse {
  responses?: { fullTextAnnotation?: { text?: string }; error?: { code?: number; message?: string } }[];
}

export function createGoogleVisionRecognizer({ apiKey, timeoutMs, fetchImpl = fetch }: GoogleVisionOptions) {
  return async function recognizeWithGoogle(buffer: Buffer): Promise<string[]> {
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        // The key goes in a header, not the URL, so it never lands in a log line or an error message.
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ requests: [{ image: { content: buffer.toString("base64") }, features: [{ type: "TEXT_DETECTION" }] }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new OcrUnavailableError(timedOut ? `Cloud Vision gave no answer within ${timeoutMs} ms` : "Cloud Vision could not be reached");
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      // 400 (a bad key) and 403 (the API turned off, billing stopped, the key restricted to other APIs) won't fix
      // themselves: someone has to change the key or the Google Cloud project, so they reach Sentry. 429 (over quota) and
      // 5xx are Google's own trouble and pass.
      const needsAPerson = response.status === 400 || response.status === 401 || response.status === 403;
      log[needsAPerson ? "error" : "warn"]("cloud vision refused the request", { status: response.status, detail });
      throw new OcrUnavailableError(`Cloud Vision answered ${response.status}`);
    }

    let body: AnnotateResponse;
    try {
      body = (await response.json()) as AnnotateResponse;
    } catch {
      throw new OcrUnavailableError("Cloud Vision sent an unreadable answer");
    }
    const first = body.responses?.[0];
    if (first?.error) {
      if (first.error.code === INVALID_ARGUMENT) throw new OcrImageError(first.error.message);
      throw new OcrUnavailableError(`Cloud Vision: ${first.error.message ?? "an error"}`);
    }
    // One entry per line Cloud Vision read; no text at all is an answer too (an empty list).
    return (first?.fullTextAnnotation?.text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };
}
