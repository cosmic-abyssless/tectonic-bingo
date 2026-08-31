import type { InferSelectModel } from "drizzle-orm";
import type { users } from "./db/schema";

// req.user is the full users row, loaded fresh from the DB on every request
// by deserializeUser (see auth/discord.ts) — the session only stores userId.
export type SessionUser = InferSelectModel<typeof users>;

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}
