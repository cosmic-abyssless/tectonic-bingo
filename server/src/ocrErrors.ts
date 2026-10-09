// The two ways reading a screenshot can fail that the rest of the app treats differently. Both are ServiceErrors, so a
// route answers them with their own status instead of a generic 500.

import { ServiceError } from "./services/errors";

/**
 * The OCR service could not be reached, took too long, or failed. The site works; analysis doesn't, for now. Expected now
 * and then (the service restarts on a deploy), so it is answered with a 503 but not reported to Sentry as a bug; the
 * outage itself is watched through the container's health.
 */
export class OcrUnavailableError extends ServiceError {
  /**
   * Won't fix itself: someone has to act (a refused Cloud Vision key, billing stopped). Logged as an error, so Sentry
   * says so; any other outage is a warning.
   */
  readonly needsAttention: boolean;
  /** Likely to last a while (a timeout, over quota, the provider down): worth not asking again for a moment. */
  readonly transient: boolean;
  /** What the other side said, for the logs. Never shown to the person who uploaded the screenshot. */
  readonly detail?: string;

  constructor(reason: string, opts: { needsAttention?: boolean; transient?: boolean; detail?: string } = {}) {
    super(503, `Screenshot analysis is temporarily unavailable (${reason})`);
    this.name = "OcrUnavailableError";
    this.needsAttention = opts.needsAttention ?? false;
    this.transient = opts.transient ?? false;
    this.detail = opts.detail;
  }
}

/**
 * This particular image could not be read (truncated, not really an image). The service is healthy and retrying the same
 * file will fail the same way, so it is a 422 for the person who uploaded it, not an outage.
 */
export class OcrImageError extends ServiceError {
  /** What the engine threw, for the logs. */
  cause?: unknown;

  constructor(cause?: unknown) {
    super(422, "The screenshot could not be read");
    this.name = "OcrImageError";
    this.cause = cause;
  }
}
