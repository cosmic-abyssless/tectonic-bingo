import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { DiscordUser } from "../types";

const scopes = ["identify", "email"];

export function configurePassport(): void {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        callbackURL: process.env.DISCORD_CALLBACK_URL!,
        scope: scopes,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const user: DiscordUser = {
          id: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar ?? null,
          email: profile.email,
          verified: profile.verified,
          global_name: profile.global_name ?? null,
        };
        return done(null, user);
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
