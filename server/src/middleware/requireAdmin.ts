import type { NextFunction, Request, Response } from "express";
import { can } from "@bingo/shared";
import { db } from "../db";
import { bingoRoles, siteRoles } from "../services/permissions";

// Mount after requireAuth. Site admins can create bingos and grant mod/admin. Under a bingo (after requireBingo) it
// asks for administer_bingo; on the Site admin pages, outside any bingo, for administer_site.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const bingo = req.bingo ?? null;
  const roles = bingo ? bingoRoles(db, bingo, req.user) : siteRoles(req.user);
  if (!can(roles, bingo, bingo ? "administer_bingo" : "administer_site").ok) {
    res.status(403).json({ error: "Site admin access required" });
    return;
  }
  if (req.audit) req.audit.actorRole = "admin";
  next();
}
