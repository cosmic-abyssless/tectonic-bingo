import type { NextFunction, Request, Response } from "express";

// Bingos are clan-only: anyone whose last Discord login showed they aren't in
// DISCORD_GUILD_ID can't see or touch them. Anonymous requests pass through so
// each route's own auth rules still apply; site admins are exempt so they can
// keep managing bingos from outside the server.
export function requireGuildMember(req: Request, res: Response, next: NextFunction): void {
  if (req.user && !req.user.inGuild && !req.user.isAdmin) {
    res.status(403).json({ error: "You need to be a member of the clan's Discord server to take part." });
    return;
  }
  next();
}
