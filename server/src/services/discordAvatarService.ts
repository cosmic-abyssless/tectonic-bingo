// Each user's Discord pictures, kept current by the bot. A login reads them too (auth/discord.ts), but a Player can stay
// logged in for weeks, so the site would keep showing a picture they changed long ago. The picture shown is their own in
// the clan's Discord server when they set one there (users.discordGuildAvatar), else their global one, as Discord does.
import { DiscordAPIError, REST } from "@discordjs/rest";
import { Routes, type APIGuildMember } from "discord-api-types/v10";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { log } from "../log";

type Db = BetterSQLite3Database<typeof schema>;

/** How often every user's pictures are read again. */
export const AVATAR_REFRESH_MS = 24 * 60 * 60 * 1000;
/** The first refresh waits this long after the server starts, out of the way of its start-up work. */
const FIRST_REFRESH_DELAY_MS = 60 * 1000;

/** A real Discord user id. Dev-seeded and generated users (dev-…, testdata-…) aren't on Discord. */
const SNOWFLAKE = /^\d{17,20}$/;

/** The stored form of a server picture (users.discordGuildAvatar): the server's id and the picture's hash. */
export function guildAvatarOf(guildId: string, hash: string | null | undefined): string | null {
  return hash ? `${guildId}/${hash}` : null;
}

/** A user's member record in the server; null when they aren't in it. Throws when Discord can't say. */
export type ReadMember = (discordUserId: string) => Promise<APIGuildMember | null>;

/**
 * Reads every Discord user's member record in the server and stores their pictures. Someone who left the server loses
 * their server picture (and keeps their stored global one). Stops at the first lookup Discord can't answer, leaving
 * the rest for the next round, rather than failing every remaining user the same way.
 */
export async function refreshDiscordAvatars(db: Db, guildId: string, readMember: ReadMember): Promise<{ read: number; changed: number }> {
  const rows = db.select({ id: users.id, discordId: users.discordId, discordAvatar: users.discordAvatar, discordGuildAvatar: users.discordGuildAvatar }).from(users).all();
  let read = 0;
  let changed = 0;
  for (const row of rows) {
    if (!SNOWFLAKE.test(row.discordId)) continue;
    let member: APIGuildMember | null;
    try {
      member = await readMember(row.discordId);
    } catch (err) {
      log.warn("discord avatar refresh stopped", { err, read });
      break;
    }
    read++;
    const discordGuildAvatar = member ? guildAvatarOf(guildId, member.avatar) : null;
    const discordAvatar = member?.user ? (member.user.avatar ?? null) : row.discordAvatar;
    if (discordGuildAvatar === row.discordGuildAvatar && discordAvatar === row.discordAvatar) continue;
    db.update(users).set({ discordAvatar, discordGuildAvatar }).where(eq(users.id, row.id)).run();
    changed++;
  }
  return { read, changed };
}

/** Reads member records with the bot's token. @discordjs/rest waits out Discord's rate limits. */
function botMemberReader(token: string, guildId: string): ReadMember {
  const rest = new REST({ version: "10" }).setToken(token);
  return async (discordUserId) => {
    try {
      return (await rest.get(Routes.guildMember(guildId, discordUserId))) as APIGuildMember;
    } catch (err) {
      if (err instanceof DiscordAPIError && err.status === 404) return null;
      throw err;
    }
  };
}

/** Refreshes every user's pictures soon after start, then daily. Does nothing without the bot (DISCORD_BOT_TOKEN and DISCORD_GUILD_ID). */
export function startDiscordAvatarRefresh(db: Db): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return;
  const readMember = botMemberReader(token, guildId);
  let running = false;
  const round = () => {
    if (running) return;
    running = true;
    refreshDiscordAvatars(db, guildId, readMember)
      .then((result) => log.info("discord avatars refreshed", result))
      .catch((err) => log.error("discord avatar refresh failed", { err }))
      .finally(() => {
        running = false;
      });
  };
  setTimeout(round, FIRST_REFRESH_DELAY_MS).unref();
  setInterval(round, AVATAR_REFRESH_MS).unref();
}
