import type { MinimalUser } from "@bingo/shared";

/** guild nick → global display name → username */
export function displayName(user: MinimalUser): string {
  return user.discordGuildNick ?? user.discordGlobalName ?? user.discordUsername;
}

// Discord's CDN keys avatars by the Discord snowflake ID (discordId), not
// our internal UUID primary key (id) — mixing those up throws inside
// BigInt() since a UUID isn't a valid numeric string.
export function avatarUrl(user: { discordId: string; discordAvatar: string | null }): string {
  if (user.discordAvatar) {
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png`;
  }
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.discordId) >> 22n) % 6}.png`;
  } catch {
    // Dev-seeded users have non-numeric discordIds (e.g. "dev-member-a").
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}
