// Starts Sentry in the browser. main.tsx imports this first so errors thrown while the rest of the app loads are caught
// too. The settings come from the server at runtime (window.__APP_CONFIG__) with the build's values as the fallback,
// see core/logging/sentryConfig.ts. With no DSN anywhere (local development) Sentry stays off and sends nothing.
import * as Sentry from "@sentry/react";
import { resolveSentryOptions } from "./core/logging/sentryConfig";

Sentry.init({
  ...resolveSentryOptions(window.__APP_CONFIG__, {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    // Railway's environment name at build time: Vite's own mode is "production" for every built bundle.
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || __SENTRY_ENVIRONMENT__,
    mode: import.meta.env.MODE,
    release: __SENTRY_RELEASE__,
  }),
  // No IP addresses, cookies or request headers.
  sendDefaultPii: false,
  integrations: [Sentry.browserTracingIntegration()],
  // A sample of page loads and navigations is enough to see where time goes on the free plan.
  tracesSampleRate: 0.1,
});
