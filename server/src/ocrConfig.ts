// Environment-driven OCR settings, kept free of the OCR engine's imports so they can be tested (and read at startup)
// without loading the model runtime.

const DEFAULT_OCR_CONCURRENCY = 5;

/** How many screenshots may be read at once (OCR_CONCURRENCY); anything else falls back to the default. */
export function ocrConcurrency(value: string | undefined = process.env.OCR_CONCURRENCY): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_OCR_CONCURRENCY;
}

/**
 * Whether to load the OCR model in the background when the server starts: in production by default, and anywhere
 * with OCR_WARMUP set to "true" or "false". Never when OCR is switched off.
 */
export function shouldWarmOcr(env: Record<string, string | undefined> = process.env): boolean {
  if (env.SCREENSHOT_OCR_DISABLED === "true") return false;
  if (env.OCR_WARMUP === "true") return true;
  if (env.OCR_WARMUP === "false") return false;
  return env.NODE_ENV === "production";
}
