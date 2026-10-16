import { describe, expect, it } from "vitest";
import { avatarUrl } from "./user";

const ID = "100000000000000001";

describe("avatarUrl", () => {
  it("shows the picture set in the clan's server first", () => {
    expect(avatarUrl({ discordId: ID, discordAvatar: "global", discordGuildAvatar: "999/server" })).toBe(`https://cdn.discordapp.com/guilds/999/users/${ID}/avatars/server.png`);
  });

  it("falls back to the global picture without one (or on a Wrapped published before it was stored)", () => {
    expect(avatarUrl({ discordId: ID, discordAvatar: "global", discordGuildAvatar: null })).toBe(`https://cdn.discordapp.com/avatars/${ID}/global.png`);
    expect(avatarUrl({ discordId: ID, discordAvatar: "global" })).toBe(`https://cdn.discordapp.com/avatars/${ID}/global.png`);
  });

  it("falls back to Discord's default picture without either", () => {
    expect(avatarUrl({ discordId: "dev-admin", discordAvatar: null })).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
  });
});
