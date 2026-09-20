/**
 * Dev mode: dev-login, the seed/test-data tools and the request-clock override exist only while this is
 * true. One check, so nothing that is dev-only can drift onto a different gate.
 */
export function isDevModeActive(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";
}

/** Dev only: the X-Dev-Skip-Ocr header lets the test data generator skip the background screenshot analysis on a submission. */
export function devSkipsOcr(headerValue: string | undefined): boolean {
  return isDevModeActive() && headerValue === "1";
}
