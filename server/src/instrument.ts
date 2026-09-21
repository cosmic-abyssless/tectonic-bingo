// Starts Sentry. index.ts imports this right after ./env and before anything that loads http or express, because Sentry
// has to patch those modules as they are first required. It reads its settings from the environment, so with no
// SENTRY_DSN (local development, tests) it is switched off and sends nothing.
import "./env";
import * as Sentry from "@sentry/node";

function sampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  // Railway names the environment ("production", "development") and sets the commit being run, so events line up with deploys.
  environment: process.env.SENTRY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "development",
  release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
  // No IP addresses, cookies, headers or request bodies (players' Discord details, session cookies, uploaded screenshots).
  sendDefaultPii: false,
  // A sample of requests is enough to see where time goes without spending the free plan on health checks and static files.
  tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  ignoreTransactions: [/\/health$/, /^GET \/uploads\//, /^GET \/assets\//],
});
