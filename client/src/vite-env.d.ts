/// <reference types="vite/client" />

/** Identifies this build (see vite.config.ts) — persisted client data is discarded when it changes. */
declare const __BUILD_ID__: string;

/** The git commit this build was made from ("" when unknown); Sentry's release name. */
declare const __SENTRY_RELEASE__: string;

/** The Railway environment this build is for ("production", "development"; "" outside Railway). */
declare const __SENTRY_ENVIRONMENT__: string;

/** Injected into index.html by the server at startup (server/src/runtimeConfig.ts); absent in local development. */
interface Window {
  __APP_CONFIG__?: { sentryDsn?: string; environment?: string; release?: string };
}

interface ImportMetaEnv {
  /** Sentry DSN for the browser (set at build time; unset means Sentry is off). */
  readonly VITE_SENTRY_DSN?: string;
  /** Overrides the environment name Sentry reports (defaults to the Vite mode). */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}
