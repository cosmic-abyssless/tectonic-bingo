import { describe, expect, it } from "vitest";
import { getAdminDiscordIds, isAdminDiscordId, sessionCookieSecure } from "./config";

describe("getAdminDiscordIds", () => {
  it("parses a comma-separated env var into trimmed IDs", () => {
    process.env.ADMIN_DISCORD_IDS = " 123, 456 ,789";
    expect(getAdminDiscordIds()).toEqual(["123", "456", "789"]);
  });

  it("returns an empty list when unset", () => {
    delete process.env.ADMIN_DISCORD_IDS;
    expect(getAdminDiscordIds()).toEqual([]);
  });
});

describe("isAdminDiscordId", () => {
  it("matches an ID present in the list", () => {
    process.env.ADMIN_DISCORD_IDS = "123,456";
    expect(isAdminDiscordId("456")).toBe(true);
    expect(isAdminDiscordId("789")).toBe(false);
  });
});

describe("sessionCookieSecure", () => {
  it("is on in production and off elsewhere by default", () => {
    expect(sessionCookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(sessionCookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(sessionCookieSecure({ NODE_ENV: "staging" })).toBe(false);
    expect(sessionCookieSecure({})).toBe(false);
  });

  it("can be forced on for staging, which is served over HTTPS but is not production", () => {
    expect(sessionCookieSecure({ NODE_ENV: "staging", COOKIE_SECURE: "true" })).toBe(true);
  });

  it("can be forced off, and ignores an empty or unrecognised value", () => {
    expect(sessionCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "false" })).toBe(false);
    expect(sessionCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "" })).toBe(true);
    expect(sessionCookieSecure({ NODE_ENV: "staging", COOKIE_SECURE: "yes" })).toBe(false);
  });
});
