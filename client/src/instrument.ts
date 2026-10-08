// Starts Sentry in the browser. main.tsx imports this first so errors thrown while the rest of the app loads are caught
// too. The settings come from the server at runtime (window.__APP_CONFIG__) with the build's values as the fallback,
// see core/logging/sentryConfig.ts. With no DSN anywhere (local development) Sentry stays off and sends nothing.
import * as Sentry from "@sentry/react";
import { isFromHeadlessScraper, resolveSentryOptions } from "./core/logging/sentryConfig";

const options = resolveSentryOptions(window.__APP_CONFIG__, {
  dsn: import.meta.env.VITE_SENTRY_DSN,
  // Railway's environment name at build time: Vite's own mode is "production" for every built bundle.
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || __SENTRY_ENVIRONMENT__,
  mode: import.meta.env.MODE,
  release: __SENTRY_RELEASE__,
});

Sentry.init({
  ...options,
  // No IP addresses, cookies or request headers.
  sendDefaultPii: false,
  // A sample of page loads and navigations is enough to see where time goes on the free plan.
  tracesSampleRate: 0.1,
  // A headless scraper crashing on its own emulated DOM isn't a player's error (see isFromHeadlessScraper).
  beforeSend: (event) => (isFromHeadlessScraper(event) ? null : event),
});

// Tracing is its own chunk (sentryTracing.ts), fetched now and added when it arrives rather than downloaded with the
// board. Its page-load span still starts at navigation start, with the page's timings and web vitals; only a request
// sent before it arrives (usually /api/me, the first) goes without a span or a trace header to the server.
if (options.dsn) void import("./sentryTracing").then((m) => Sentry.addIntegration(m.browserTracingIntegration()));
