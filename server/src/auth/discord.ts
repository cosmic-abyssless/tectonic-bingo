import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { REST } from "@discordjs/rest";
import type { APIGuildMember } from "discord-api-types/v10";
import { DiscordUser } from "../types";

async function fetchUserTeam(accessToken: string): Promise<string | null> {
  try {
    // Use the user's own OAuth token — no bot required
    const rest = new REST({ version: "10", authPrefix: "Bearer" }).setToken(accessToken);
    const member = (await rest.get(
      `/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`
    )) as APIGuildMember;

    // Read env vars here (not at module load) so dotenv has already run
    const teamRoleMap: Record<string, string | undefined> = {
      "Red Team": process.env.TEAM_ROLE_RED,
      "Blue Team": process.env.TEAM_ROLE_BLUE,
      "Green Team": process.env.TEAM_ROLE_GREEN,
      "Yellow Team": process.env.TEAM_ROLE_YELLOW,
      "Orange Team": process.env.TEAM_ROLE_ORANGE,
      "Pink Team": process.env.TEAM_ROLE_PINK,
    };

    const memberRoleIds = new Set(member.roles);
    const entry = Object.entries(teamRoleMap).find(
      ([, roleId]) => roleId && memberRoleIds.has(roleId)
    );
    return entry?.[0] ?? null;
  } catch {
    // User is not in the guild or API error — no team
    return null;
  }
}

const scopes = ["identify", "email", "guilds.members.read"];

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
          const team = await fetchUserTeam(accessToken);
          const user: DiscordUser = {
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar ?? null,
            email: profile.email,
            verified: profile.verified,
            global_name: profile.global_name ?? null,
            team,
          };
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user as DiscordUser);
  });
}
