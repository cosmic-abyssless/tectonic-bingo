/**
 * Dev mode: dev-login, the seed/test-data tools and the request-clock override exist only while this is
 * true. One check, so nothing that is dev-only can drift onto a different gate.
 */
export function isDevModeActive(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";
}
