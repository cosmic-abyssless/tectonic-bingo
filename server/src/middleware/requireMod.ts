import { Request, Response, NextFunction } from "express";
import type { DiscordUser } from "../types";

export function requireMod(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as DiscordUser | undefined;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!user.isModerator) {
    res.status(403).json({ error: "Moderator access required" });
    return;
  }
  next();
}
