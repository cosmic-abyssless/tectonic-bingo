// The contract between the API and the OCR service, shared by both sides so they can't drift apart.
//
//   POST /recognize   body: the image's bytes      header: X-OCR-Priority: interactive | background
//                     200 { "lines": string[] }    one entry per line of text read from the image
//   GET  /health      200 { ok: true } once the model is loaded, 503 while it is still loading
//
// The service is reachable only from the Compose network, so there is no authentication.

import type { OcrPriority } from "./ocrScheduler";

export const OCR_RECOGNIZE_PATH = "/recognize";
export const OCR_HEALTH_PATH = "/health";
export const OCR_PRIORITY_HEADER = "x-ocr-priority";

export function parseOcrPriority(value: string | undefined): OcrPriority {
  return value === "background" ? "background" : "interactive";
}
