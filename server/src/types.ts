import type { InferSelectModel } from "drizzle-orm";
import type { bingos, users } from "./db/schema";
import type { AuditContext } from "./audit/context";

// req.user is the full users row, loaded fresh from the DB on every request
// by deserializeUser (see auth/discord.ts) — the session only stores userId.
export type SessionUser = InferSelectModel<typeof users>;
export type SessionBingo = InferSelectModel<typeof bingos>;

declare global {
  namespace Express {
    interface User extends SessionUser {}
    interface Request {
      // Attached by middleware/requireBingo for any route under /:slug.
      bingo?: SessionBingo;
      // Attached by audit/middleware.ts's auditContext, mounted app-wide.
      audit?: AuditContext;
    }
  }
}
