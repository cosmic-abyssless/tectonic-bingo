// Discord team sync (server/src/services/discordTeamService.ts): the channels each Team gets, as a Bingo's admins
// set them up in Settings > Discord. Here so the settings editor previews names exactly as the server makes them.

export type DiscordChannelType = "text" | "voice";

/**
 * One channel every Team gets. `key` is stable: it ties the Team's channel in Discord to this entry, so renaming the
 * entry renames the channels (keeping their messages) rather than making new ones. Removing an entry deletes its
 * channels; changing its type replaces them (Discord can't turn a text channel into a voice one).
 */
export interface DiscordChannelTemplate {
  key: string;
  type: DiscordChannelType;
  /** The channel's name, with {team} for the Team's name, e.g. "{team}-loot". */
  name: string;
}

export const DISCORD_TEAM_PLACEHOLDER = "{team}";
export const MAX_DISCORD_CHANNELS = 10;
export const DISCORD_NAME_MAX = 100;

/** What a Bingo starts with: a text and a voice channel per Team, each named after it. */
export const DEFAULT_DISCORD_CHANNELS: DiscordChannelTemplate[] = [
  { key: "chat", type: "text", name: DISCORD_TEAM_PLACEHOLDER },
  { key: "voice", type: "voice", name: DISCORD_TEAM_PLACEHOLDER },
];

/** A text channel's name the way Discord writes it (lowercase, dashes for spaces), so a sync never sees its own change. */
export function discordTextChannelName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, DISCORD_NAME_MAX) || "team"
  );
}

/** The name a Team's channel gets from its template. */
export function discordChannelName(template: Pick<DiscordChannelTemplate, "type" | "name">, teamName: string): string {
  const name = template.name.split(DISCORD_TEAM_PLACEHOLDER).join(teamName.trim());
  return template.type === "text" ? discordTextChannelName(name) : name.trim().slice(0, DISCORD_NAME_MAX) || "team";
}

/** A Team's role's name: the Team's. */
export function discordRoleName(teamName: string): string {
  return teamName.trim().slice(0, DISCORD_NAME_MAX) || "Team";
}

/** The category's name: the one set in the settings, or the Bingo's. */
export function discordCategoryName(categoryName: string | null, bingoName: string): string {
  return (categoryName?.trim() || bingoName.trim()).slice(0, DISCORD_NAME_MAX) || "Bingo";
}

/** Why a channel list can't be saved, or null. The server checks the same (normalizeDiscordChannels). */
export function discordChannelsProblem(channels: Pick<DiscordChannelTemplate, "type" | "name">[]): string | null {
  if (channels.length > MAX_DISCORD_CHANNELS) return `At most ${MAX_DISCORD_CHANNELS} channels per team.`;
  for (const c of channels) {
    if (c.type !== "text" && c.type !== "voice") return "A channel is either text or voice.";
    if (!c.name.includes(DISCORD_TEAM_PLACEHOLDER)) return `Every channel name needs ${DISCORD_TEAM_PLACEHOLDER}, or every team's channel would have the same name.`;
    if (c.name.length > DISCORD_NAME_MAX) return `A channel name is at most ${DISCORD_NAME_MAX} characters.`;
  }
  return null;
}

/** One Team's Discord role and channels, as the Discord team sync made them (null: not made yet). */
export interface DiscordTeamLinks {
  teamId: string;
  teamName: string;
  roleId: string | null;
  /** One per channel in the Bingo's list, in its order. */
  channels: { key: string; channelId: string | null }[];
}

/** What the Discord team sync has made for a Bingo, for its settings panel (GET .../admin/discord). */
export interface DiscordSyncStatus {
  /** Why it isn't syncing now, or null when it is. */
  blocker: string | null;
  guildId: string | null;
  categoryId: string | null;
  teams: DiscordTeamLinks[];
  /** How many roles and channels the sync has made for this Bingo, Teams and channels that are gone included. */
  resourceCount: number;
}
