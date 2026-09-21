// Where the browser's Sentry settings come from. The server injects `window.__APP_CONFIG__` into index.html when it
// starts (server/src/runtimeConfig.ts), so one build can be deployed to staging and to production and report as each.
// The build-time values are the fallback: local development (no server injecting anything) and the Railway build.

export interface RuntimeConfig {
  sentryDsn?: string;
  environment?: string;
  release?: string;
}

export interface BuildValues {
  dsn?: string;
  environment?: string;
  /** Vite's mode: the last resort for the environment name. */
  mode: string;
  release?: string;
}

export function resolveSentryOptions(runtime: RuntimeConfig | undefined, build: BuildValues): { dsn: string | undefined; environment: string; release: string | undefined } {
  return {
    dsn: runtime?.sentryDsn || build.dsn || undefined,
    environment: runtime?.environment || build.environment || build.mode,
    release: runtime?.release || build.release || undefined,
  };
}
