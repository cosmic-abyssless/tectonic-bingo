import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { DiscordUser } from "../types";

const TEAM_ROLES = [
  "Pink Team",
  "Yellow Team",
  "Orange Team",
  "Red Team",
  "Green Team",
  "Blue Team",
];

async function fetchUserTeam(userId: string): Promise<string | null> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  const [memberRes, rolesRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    }),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
    }),
  ]);

  if (!memberRes.ok || !rolesRes.ok) return null;

  const [member, roles] = await Promise.all([
    memberRes.json(),
    rolesRes.json(),
  ]);
  const memberRoleIds = new Set<string>(member.roles);
  const teamRole = (roles as { id: string; name: string }[]).find(
    (r) => memberRoleIds.has(r.id) && TEAM_ROLES.includes(r.name),
  );

  return teamRole?.name ?? null;
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
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const team = await fetchUserTeam(profile.id);
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
