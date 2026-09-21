// Settings the browser needs but that must not be baked into the built client, because one build (one Docker image) is
// deployed to more than one place (staging and production) and each must report to Sentry as itself. The server reads
// them from its environment when it starts and injects them into index.html as `window.__APP_CONFIG__`; the client
// reads that object first and falls back to its build-time values (local development, the Railway build).

export interface RuntimeConfig {
  /** The browser project's DSN (a different project from the server's own `SENTRY_DSN`). Empty leaves Sentry off. */
  sentryDsn?: string;
  environment?: string;
  release?: string;
}

const pick = (...values: (string | undefined)[]): string | undefined => values.map((v) => v?.trim()).find((v) => !!v);

export function readRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  return {
    // VITE_SENTRY_DSN is what Railway already has set; it is a runtime variable there too.
    sentryDsn: pick(env.CLIENT_SENTRY_DSN, env.VITE_SENTRY_DSN),
    environment: pick(env.SENTRY_ENVIRONMENT, env.RAILWAY_ENVIRONMENT_NAME, env.NODE_ENV),
    release: pick(env.SENTRY_RELEASE, env.RAILWAY_GIT_COMMIT_SHA),
  };
}

// `<` is escaped so a value can never close the script tag; U+2028/2029 are line terminators in older JavaScript.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const escapeForScript = (json: string) => json.replace(/</g, "\\u003c").split(LINE_SEPARATOR).join("\\u2028").split(PARAGRAPH_SEPARATOR).join("\\u2029");

/** Puts the config in the page's head, ahead of the app's own scripts. */
export function injectRuntimeConfig(html: string, config: RuntimeConfig): string {
  const tag = `<script>window.__APP_CONFIG__=${escapeForScript(JSON.stringify(config))}</script>`;
  // A replacer function, not a string, because the tag may contain `$` sequences that String.replace would interpret.
  return html.includes("</head>") ? html.replace("</head>", () => `${tag}</head>`) : tag + html;
}
