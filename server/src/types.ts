export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  verified?: boolean;
  global_name?: string | null;
  guild_nick: string | null;
  team: string | null;
}

// Extend express-session to include our user type
declare module "express-session" {
  interface SessionData {
    user?: DiscordUser;
  }
}
