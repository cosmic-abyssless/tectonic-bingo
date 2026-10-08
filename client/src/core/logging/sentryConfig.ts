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

/** The frames of an event's exceptions: the shape of Sentry's, as much as is read here. */
interface EventLike {
  exception?: { values?: { stacktrace?: { frames?: { filename?: string; abs_path?: string }[] } }[] };
}

// Scripts a headless scraping browser injects into the page under its own name. Obscura (a Rust headless browser with an
// emulated DOM) has no <template> content, so react-aria's collections crash it on the home page (TECTONIC-CLIENT-4):
// a bot, not a player, and nothing a real browser hits.
const SCRAPER_FRAMES = ["<obscura:"];

/** Whether an error came from a headless scraper's own injected script (see SCRAPER_FRAMES): not worth reporting. */
export function isFromHeadlessScraper(event: EventLike): boolean {
  return (event.exception?.values ?? []).some((value) =>
    (value.stacktrace?.frames ?? []).some((frame) => SCRAPER_FRAMES.some((prefix) => frame.filename?.startsWith(prefix) || frame.abs_path?.startsWith(prefix))),
  );
}
