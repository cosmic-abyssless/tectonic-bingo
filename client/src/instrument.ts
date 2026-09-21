// Starts Sentry in the browser. main.tsx imports this first so errors thrown while the rest of the app loads are caught
// too. VITE_SENTRY_DSN is set at build time; with none (local development) Sentry stays off and sends nothing.
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || undefined,
  // Railway's environment name first, so a dev-site error never shows up as "production"; Vite's mode is the fallback.
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || __SENTRY_ENVIRONMENT__ || import.meta.env.MODE,
  // The commit this build was made from (see vite.config.ts), so an error names the deploy that shipped it.
  release: __SENTRY_RELEASE__ || undefined,
  // No IP addresses, cookies or request headers.
  sendDefaultPii: false,
  integrations: [Sentry.browserTracingIntegration()],
  // A sample of page loads and navigations is enough to see where time goes on the free plan.
  tracesSampleRate: 0.1,
});
