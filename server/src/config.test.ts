import { describe, expect, it } from "vitest";
import { getAdminDiscordIds, isAdminDiscordId } from "./config";

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
