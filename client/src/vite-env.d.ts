/// <reference types="vite/client" />

/** Identifies this build (see vite.config.ts) — persisted client data is discarded when it changes. */
declare const __BUILD_ID__: string;

/** The git commit this build was made from ("" when unknown); Sentry's release name. */
declare const __SENTRY_RELEASE__: string;

interface ImportMetaEnv {
  /** Sentry DSN for the browser (set at build time; unset means Sentry is off). */
  readonly VITE_SENTRY_DSN?: string;
  /** Overrides the environment name Sentry reports (defaults to the Vite mode). */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}
