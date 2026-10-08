import { describe, expect, it } from "vitest";
import { isFromHeadlessScraper, resolveSentryOptions } from "./sentryConfig";

const build = { dsn: "https://build@x/1", environment: "development", mode: "production", release: "buildsha" };

describe("resolveSentryOptions", () => {
  it("takes what the server injected over anything baked into the build", () => {
    expect(resolveSentryOptions({ sentryDsn: "https://run@x/2", environment: "staging", release: "runsha" }, build)).toEqual({ dsn: "https://run@x/2", environment: "staging", release: "runsha" });
  });

  it("falls back to the build values field by field", () => {
    expect(resolveSentryOptions({ environment: "staging" }, build)).toEqual({ dsn: "https://build@x/1", environment: "staging", release: "buildsha" });
  });

  it("uses the build alone when nothing was injected (local development)", () => {
    expect(resolveSentryOptions(undefined, build)).toEqual({ dsn: "https://build@x/1", environment: "development", release: "buildsha" });
  });

  it("ends at Vite's mode for the environment and leaves Sentry off with no DSN anywhere", () => {
    expect(resolveSentryOptions({}, { mode: "development" })).toEqual({ dsn: undefined, environment: "development", release: undefined });
  });

  it("treats empty strings as unset", () => {
    expect(resolveSentryOptions({ sentryDsn: "", environment: "" }, build).dsn).toBe("https://build@x/1");
    expect(resolveSentryOptions({ sentryDsn: "", environment: "" }, build).environment).toBe("development");
  });
});

describe("isFromHeadlessScraper", () => {
  // The frames of TECTONIC-CLIENT-4: Obscura's bootstrap at the top, then React and react-aria.
  const obscura = {
    exception: {
      values: [
        {
          stacktrace: {
            frames: [
              { filename: "../../node_modules/react-aria/dist/private/collections/Hidden.mjs" },
              { filename: "../../node_modules/react-dom/cjs/react-dom-client.production.js" },
              { filename: "<obscura:bootstrap>" },
            ],
          },
        },
      ],
    },
  };

  it("spots an error thrown from Obscura's injected script", () => {
    expect(isFromHeadlessScraper(obscura)).toBe(true);
  });

  it("leaves an ordinary error alone, and one with no stack", () => {
    expect(isFromHeadlessScraper({ exception: { values: [{ stacktrace: { frames: [{ filename: "../../src/App.tsx" }] } }] } })).toBe(false);
    expect(isFromHeadlessScraper({})).toBe(false);
  });
});
