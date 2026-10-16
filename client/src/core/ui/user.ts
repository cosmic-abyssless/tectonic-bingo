import { discordName, playerName, type MinimalUser } from "@bingo/shared";

/**
 * How a player is shown: their RSN when the server sent one (inside a bingo, for anyone who signed up), otherwise
 * their Discord name. Where the Discord name is wanted on purpose, use `discordName` and label it.
 */
export function displayName(user: Pick<MinimalUser, "discordUsername" | "discordGlobalName" | "discordGuildNick"> & { rsn?: string | null }): string {
  return playerName(user);
}

export { discordName };

// Discord's CDN keys avatars by the Discord snowflake ID (discordId), not
// our internal UUID primary key (id) — mixing those up throws inside
// BigInt() since a UUID isn't a valid numeric string.
// Their own picture in the clan's server comes first, as Discord shows it there (discordGuildAvatar: `<guild id>/<hash>`).
export function avatarUrl(user: { discordId: string; discordAvatar: string | null; discordGuildAvatar?: string | null }): string {
  const [guildId, guildHash] = user.discordGuildAvatar?.split("/") ?? [];
  if (guildId && guildHash) {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.discordId}/avatars/${guildHash}.png`;
  }
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
