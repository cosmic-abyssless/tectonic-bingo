import type { NextFunction, Request, Response } from "express";

// Whether a logged-in user gets past the clan gate: members of DISCORD_GUILD_ID as of their last Discord login, and site
// admins (so they can keep managing bingos from outside the server).
export function passesGuildGate(user: Express.User): boolean {
  return user.inGuild || user.isAdmin;
}

// Bingos are clan-only: anyone whose last Discord login showed they aren't in
// DISCORD_GUILD_ID can't see or touch them. Anonymous requests pass through so
// each route's own auth rules still apply; site admins are exempt so they can
// keep managing bingos from outside the server.
export function requireGuildMember(req: Request, res: Response, next: NextFunction): void {
  if (req.user && !passesGuildGate(req.user)) {
    res.status(403).json({ error: "You need to be a member of the clan's Discord server to take part." });
    return;
  }
  next();
}

// For files rather than API calls (the /uploads route): a login that passes the clan gate, or a bare 401. No JSON, no
// redirect and no SPA page, since what asks is an <img>.
export function requireGuildMemberLogin(req: Request, res: Response, next: NextFunction): void {
  if (req.user && passesGuildGate(req.user)) {
    next();
    return;
  }
  res.status(401).end();
}
