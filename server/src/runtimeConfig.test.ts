import { describe, expect, it } from "vitest";
import { injectRuntimeConfig, readRuntimeConfig } from "./runtimeConfig";

describe("readRuntimeConfig", () => {
  it("prefers the explicit variables and falls back to Railway's", () => {
    expect(readRuntimeConfig({ CLIENT_SENTRY_DSN: "https://a@x/1", VITE_SENTRY_DSN: "https://b@x/2", SENTRY_ENVIRONMENT: "staging", RAILWAY_ENVIRONMENT_NAME: "production", SENTRY_RELEASE: "abc", RAILWAY_GIT_COMMIT_SHA: "def" })).toEqual({
      sentryDsn: "https://a@x/1",
      environment: "staging",
      release: "abc",
    });
    expect(readRuntimeConfig({ VITE_SENTRY_DSN: "https://b@x/2", RAILWAY_ENVIRONMENT_NAME: "development", RAILWAY_GIT_COMMIT_SHA: "def" })).toEqual({ sentryDsn: "https://b@x/2", environment: "development", release: "def" });
  });

  it("never takes the environment from NODE_ENV, which the image sets to production everywhere", () => {
    // Left undefined, the browser falls back to its own build-time environment instead of reporting a false "production".
    expect(readRuntimeConfig({ NODE_ENV: "production" })).toEqual({ sentryDsn: undefined, environment: undefined, release: undefined });
  });

  it("treats blank values as unset", () => {
    expect(readRuntimeConfig({ CLIENT_SENTRY_DSN: "  ", VITE_SENTRY_DSN: "https://b@x/2", SENTRY_ENVIRONMENT: "" }).sentryDsn).toBe("https://b@x/2");
  });
});

describe("injectRuntimeConfig", () => {
  const page = "<html><head><title>t</title></head><body></body></html>";

  it("puts the config in the head, before the closing tag", () => {
    const out = injectRuntimeConfig(page, { sentryDsn: "https://a@x/1", environment: "staging", release: "abc" });
    expect(out).toContain('<script>window.__APP_CONFIG__={"sentryDsn":"https://a@x/1","environment":"staging","release":"abc"}</script></head>');
  });

  it("leaves out unset values", () => {
    expect(injectRuntimeConfig(page, { environment: "production" })).toContain('window.__APP_CONFIG__={"environment":"production"}');
  });

  it("can never be broken out of the script tag or mangled by replacement patterns", () => {
    const out = injectRuntimeConfig(page, { release: "</script><script>alert(1)</script>$&$1" });
    expect(out.match(/<\/script>/g)).toHaveLength(1);
    expect(out).toContain("\\u003c/script>");
    expect(out).toContain("$&$1");
  });

  it("still works on a page with no head", () => {
    expect(injectRuntimeConfig("<p>hi</p>", { environment: "x" })).toBe('<script>window.__APP_CONFIG__={"environment":"x"}</script><p>hi</p>');
  });
});
