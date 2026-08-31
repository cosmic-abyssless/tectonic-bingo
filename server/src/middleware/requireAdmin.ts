import type { NextFunction, Request, Response } from "express";

// Mount after requireAuth. Site admins can create bingos and grant mod/admin.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Site admin access required" });
    return;
  }
  next();
}
