import type { NextFunction, Request, Response } from "express";
import { can } from "@bingo/shared";
import { db } from "../db";
import { bingoRoles } from "../services/permissions";

// Mount after requireAuth and requireBingo. Lets through whoever may moderate the bingo: its Moderators, and every
// site admin (Admin holds every Action).
export async function requireBingoMod(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.bingo) {
    res.status(500).json({ error: "requireBingoMod must run after requireBingo" });
    return;
  }
  const roles = bingoRoles(db, req.bingo, req.user);
  if (!can(roles, req.bingo, "moderate_bingo").ok) {
    res.status(403).json({ error: "Moderator access required for this bingo" });
    return;
  }
  if (req.audit) req.audit.actorRole = roles.includes("admin") ? "admin" : "mod";
  next();
}
