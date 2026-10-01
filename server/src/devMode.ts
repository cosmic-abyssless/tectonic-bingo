import type { Session, SessionData } from "express-session";

declare module "express-session" {
  interface SessionData {
    /** Dev only: see devAdminOff. */
    devAdminOff?: boolean;
  }
}

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

/**
 * Dev only: the X-Dev-Skip-Integrations header keeps a request away from the outside services a real player's would
 * reach: for that request the clan API reads as not configured (no membership check, draft-room profiles or roster
 * names) and no WOM/RuneProfile stats are fetched. So the test data generator's made-up players never hit those APIs,
 * on a dev server with the integrations configured or on staging, and nobody has to turn the integrations off to run
 * it. The audit middleware puts it on the request's context (audit/context.ts). Test data bingos are never synced to
 * WOM either (womCompetitionService).
 */
export function devSkipsIntegrations(headerValue: string | undefined): boolean {
  return isDevModeActive() && headerValue === "1";
}

/**
 * Dev only: an admin switched their admin powers off from the account switcher (POST /auth/dev-admin), to try the app
 * as their other roles without switching accounts. deserializeUser then loads them as a non-admin, so every check
 * (server, client and sockets) sees one. It lasts for the session: logging in as anyone (dev-login) starts it over.
 */
export function devAdminOff(session: (Session & Partial<SessionData>) | undefined): boolean {
  return isDevModeActive() && !!session?.devAdminOff;
}
