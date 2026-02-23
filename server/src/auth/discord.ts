import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { REST } from "@discordjs/rest";
import type { APIGuildMember } from "discord-api-types/v10";
import { DiscordUser } from "../types";

interface GuildMemberInfo {
  team: string | null;
  guild_nick: string | null;
}

async function fetchGuildMemberInfo(accessToken: string): Promise<GuildMemberInfo> {
  try {
    const rest = new REST({ version: "10", authPrefix: "Bearer" }).setToken(accessToken);
    const member = (await rest.get(
      `/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`,
    )) as APIGuildMember;

    const teamRoleMap: Record<string, string | undefined> = {
      "Red Team":    process.env.TEAM_ROLE_RED,
      "Blue Team":   process.env.TEAM_ROLE_BLUE,
      "Green Team":  process.env.TEAM_ROLE_GREEN,
      "Yellow Team": process.env.TEAM_ROLE_YELLOW,
      "Orange Team": process.env.TEAM_ROLE_ORANGE,
      "Pink Team":   process.env.TEAM_ROLE_PINK,
    };

    const memberRoleIds = new Set(member.roles);
    const entry = Object.entries(teamRoleMap).find(
      ([, roleId]) => roleId && memberRoleIds.has(roleId),
    );

    return {
      team: entry?.[0] ?? null,
      guild_nick: member.nick ?? null,
    };
  } catch {
    return { team: null, guild_nick: null };
  }
}

const scopes = ["identify", "guilds", "guilds.members.read"];

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
          const { team, guild_nick } = await fetchGuildMemberInfo(accessToken);
          const user: DiscordUser = {
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar ?? null,
            email: profile.email,
            verified: profile.verified,
            global_name: profile.global_name ?? null,
            guild_nick,
            team,
          };
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user as DiscordUser);
  });
}
