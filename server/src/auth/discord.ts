import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { DiscordAPIError, REST } from "@discordjs/rest";
import type { APIGuildMember } from "discord-api-types/v10";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db } from "../db";
import { users } from "../db/schema";
import * as schema from "../db/schema";
import { isAdminDiscordId } from "../config";
import type { SessionUser } from "../types";
import { audit } from "../audit/record";
import { userLabel } from "../audit/describe";

interface LoginProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

// Result of asking Discord whether the signer is in DISCORD_GUILD_ID.
// `null` means we couldn't tell (lookup failed), so the stored answer is
// left as-is rather than locking someone out over a transient error.
export type GuildMembership = { inGuild: true; nick: string | null } | { inGuild: false } | null;

// Upserts the user row for a Discord login and applies the ADMIN_DISCORD_IDS
// bootstrap (elevate-only — never demotes an admin granted via the admin
// panel just because they later drop off the env var). Factored out of the
// passport verify callback so it's testable without a real OAuth round trip.
export async function upsertLoginUser(
  dbInstance: BetterSQLite3Database<typeof schema>,
  profile: LoginProfile,
  guild: GuildMembership,
): Promise<SessionUser> {
  const bootstrapAdmin = isAdminDiscordId(profile.id);
  const values = {
    discordId: profile.id,
    discordUsername: profile.username,
    discordGlobalName: profile.global_name ?? null,
    discordAvatar: profile.avatar ?? null,
    ...(guild && { inGuild: guild.inGuild, discordGuildNick: guild.inGuild ? guild.nick : null }),
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
    audit(dbInstance, {
      action: "user.admin_changed",
      bingoId: null,
      entity: { type: "user", id: dbUser.id, label: userLabel(dbUser) },
      details: { isAdmin: { before: false, after: true }, source: "env_bootstrap" },
      actor: "system",
    });
    dbUser.isAdmin = true;
  }

  return dbUser;
}

// Asks Discord for the signer's member record in DISCORD_GUILD_ID. A 404
// means they aren't in the server; anything else (rate limit, outage) is
// treated as unknown so a flaky lookup never revokes access.
async function fetchGuildMembership(accessToken: string): Promise<GuildMembership> {
  try {
    const rest = new REST({ version: "10", authPrefix: "Bearer" }).setToken(accessToken);
    const member = (await rest.get(`/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`)) as APIGuildMember;
    return { inGuild: true, nick: member.nick ?? null };
  } catch (err) {
    if (err instanceof DiscordAPIError && err.status === 404) return { inGuild: false };
    console.warn("[auth] guild membership lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function configurePassport(): void {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        callbackURL: process.env.DISCORD_CALLBACK_URL!,
        scope: ["identify", "guilds.members.read"],
      },
      async (accessToken, _refreshToken, profile, done) => {
        try {
          const guild = await fetchGuildMembership(accessToken);
          const dbUser = await upsertLoginUser(db, profile, guild);
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
