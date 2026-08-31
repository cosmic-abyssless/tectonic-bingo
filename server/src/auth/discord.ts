import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { REST } from "@discordjs/rest";
import type { APIGuildMember } from "discord-api-types/v10";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db } from "../db";
import { users } from "../db/schema";
import * as schema from "../db/schema";
import { isAdminDiscordId } from "../config";
import type { SessionUser } from "../types";

interface LoginProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

// Upserts the user row for a Discord login and applies the ADMIN_DISCORD_IDS
// bootstrap (elevate-only — never demotes an admin granted via the admin
// panel just because they later drop off the env var). Factored out of the
// passport verify callback so it's testable without a real OAuth round trip.
export async function upsertLoginUser(
  dbInstance: BetterSQLite3Database<typeof schema>,
  profile: LoginProfile,
  guildNick: string | null,
): Promise<SessionUser> {
  const bootstrapAdmin = isAdminDiscordId(profile.id);
  const values = {
    discordId: profile.id,
    discordUsername: profile.username,
    discordGlobalName: profile.global_name ?? null,
    discordGuildNick: guildNick,
    discordAvatar: profile.avatar ?? null,
  };

  const [dbUser] = await dbInstance
    .insert(users)
    .values({ ...values, isAdmin: bootstrapAdmin })
    .onConflictDoUpdate({
      target: users.discordId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (bootstrapAdmin && !dbUser.isAdmin) {
    await dbInstance.update(users).set({ isAdmin: true }).where(eq(users.id, dbUser.id));
    dbUser.isAdmin = true;
  }

  return dbUser;
}

// Only fetched when DISCORD_GUILD_ID is configured — purely cosmetic (display
// the clan's in-guild nickname). Team membership and mod status no longer
// come from Discord; they're DB data (bingo_moderators, team_members).
async function fetchGuildNick(accessToken: string): Promise<string | null> {
  if (!process.env.DISCORD_GUILD_ID) return null;
  try {
    const rest = new REST({ version: "10", authPrefix: "Bearer" }).setToken(accessToken);
    const member = (await rest.get(
      `/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`,
    )) as APIGuildMember;
    return member.nick ?? null;
  } catch {
    return null;
  }
}

const scopes = process.env.DISCORD_GUILD_ID ? ["identify", "guilds.members.read"] : ["identify"];

export function configurePassport(): void {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        callbackURL: process.env.DISCORD_CALLBACK_URL!,
        scope: scopes,
      },
      async (accessToken, _refreshToken, profile, done) => {
        try {
          const guildNick = await fetchGuildNick(accessToken);
          const dbUser = await upsertLoginUser(db, profile, guildNick);
          return done(null, dbUser);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );

  // Only the user ID is persisted in the session cookie — deserializeUser
  // loads the current DB row on every request, so role/profile changes take
  // effect immediately instead of being frozen until the next login.
  passport.serializeUser((user, done) => {
    done(null, (user as SessionUser).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [dbUser] = await db.select().from(users).where(eq(users.id, id));
      done(null, dbUser ?? false);
    } catch (err) {
      done(err as Error);
    }
  });
}
