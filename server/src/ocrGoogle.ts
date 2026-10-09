// Reading a screenshot with Google Cloud Vision (TEXT_DETECTION): the first reader when GOOGLE_VISION_API_KEY is set,
// with the local engine (the OCR service, or this process) as its fallback (ocr.ts). Measured on the Historical Bingo's
// screenshots it is about five times faster than the local engine and misreads less (issue #485,
// scripts/ocr-compare.ts).

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
  // Only throws: the caller (withFallback in ocrText.ts) logs each failure once, at the level the error asks for.
  return async function recognizeWithGoogle(buffer: Buffer): Promise<string[]> {
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        // The key goes in a header, not the URL, so it never lands in a log line or an error message.
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        // languageHints: on 100 of the Historical Bingo's screenshots it left the item matches exactly as they were and
        // cut the lines with stray non-Latin characters (the game's bitmap font read as another script) from 124 to 35.
        body: JSON.stringify({
          requests: [{ image: { content: buffer.toString("base64") }, features: [{ type: "TEXT_DETECTION" }], imageContext: { languageHints: ["en"] } }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new OcrUnavailableError(timedOut ? `Cloud Vision gave no answer within ${timeoutMs} ms` : "Cloud Vision could not be reached", { transient: true });
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      // 429 (over quota) and 5xx are Google's own trouble, and pass. A 400 that doesn't name the key, and 413, are about
      // this one request. Any other 4xx won't fix itself and needs a person: a refused key (a 400 naming it,
      // API_KEY_INVALID; 401; 403 for the API turned off, billing stopped, the key restricted to other APIs), or
      // something answering in Google's place (a proxy's 404, a retired endpoint).
      const transient = response.status === 429 || response.status >= 500;
      const perRequest = (response.status === 400 && !/API_KEY|API key/i.test(detail)) || response.status === 413;
      const needsAttention = !transient && !perRequest && response.status >= 400 && response.status < 500;
      throw new OcrUnavailableError(`Cloud Vision answered ${response.status}`, { needsAttention, transient, detail });
    }

    let body: AnnotateResponse;
    try {
      body = (await response.json()) as AnnotateResponse;
    } catch {
      throw new OcrUnavailableError("Cloud Vision sent an unreadable answer", { transient: true });
    }
    // Anything but one response per image is not a reading (a proxy's page, a change on Google's side): it must not be
    // cached as "no text" (createTextReader caches every reading for 15 minutes).
    const first = Array.isArray(body?.responses) ? body.responses[0] : undefined;
    if (!first || typeof first !== "object") throw new OcrUnavailableError("Cloud Vision sent an unexpected answer", { transient: true });
    if (first.error) {
      const code = first.error.code;
      if (code === INVALID_ARGUMENT) throw new OcrImageError(first.error.message);
      // The google.rpc.Code inside a 200 mirrors the HTTP statuses above: RESOURCE_EXHAUSTED (8) and UNAVAILABLE (14) are
      // Google's trouble, PERMISSION_DENIED (7) and UNAUTHENTICATED (16) a refused key. Anything else (DEADLINE_EXCEEDED,
      // INTERNAL) is about this one image: it falls back on its own, without taking Cloud Vision away from everyone else.
      throw new OcrUnavailableError(`Cloud Vision: ${first.error.message ?? "an error"}`, {
        transient: code === 8 || code === 14,
        needsAttention: code === 7 || code === 16,
      });
    }
    // One entry per line Cloud Vision read; a screenshot with no text at all has no fullTextAnnotation (an empty list).
    return (first.fullTextAnnotation?.text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };
}
