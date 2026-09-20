// How players are named. Kept in its own module so both the shared index and the audit labels can use it.

interface DiscordNames {
  discordUsername: string;
  discordGlobalName: string | null;
  discordGuildNick: string | null;
}

/**
 * How a player is named inside a bingo: their RSN when they signed up with one (the server puts it on `rsn` for the
 * users it sends inside a bingo), otherwise their Discord name. Use discordName where the Discord name is wanted on
 * purpose and labelled as such.
 */
export function playerName(user: DiscordNames & { rsn?: string | null }): string {
  return user.rsn?.trim() || discordName(user);
}

/** The Discord name: guild nick, then global display name, then username. */
export function discordName(user: DiscordNames): string {
  return user.discordGuildNick ?? user.discordGlobalName ?? user.discordUsername;
}
