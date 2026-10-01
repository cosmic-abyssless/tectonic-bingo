import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { bingos } from "../db/schema";
import { log } from "../log";
import { bingoRolesOfEveryone, changedRoleHolders } from "../services/permissions";
import { broadcast } from "../ws";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Mount on /api/bingos/:slug, ahead of its routers. A write that changes anyone's roles in the bingo (a Moderator added
// or removed, a Captain replaced, a Team member drafted, added or removed, a Signup made or withdrawn, a Team deleted,
// the stage moved on) tells those users with access_changed, and their clients refetch their permissions. Worked out by
// comparing everyone's roles before and after the write, so no route has to remember to, and one that changes roles in
// a way nobody listed still tells them. A site admin's flag is site-wide: PATCH /api/admin/users/:id sends its own.
export function broadcastAccessChanges(req: Request, res: Response, next: NextFunction): void {
  if (READ_METHODS.has(req.method) || !req.user) {
    next();
    return;
  }
  const bingo = db.select().from(bingos).where(eq(bingos.slug, req.params.slug as string)).get();
  if (!bingo) {
    next();
    return;
  }
  const before = bingoRolesOfEveryone(db, bingo);
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    try {
      // Fresh: the write may have moved the stage on, or deleted the bingo (nothing to tell then).
      const after = db.select().from(bingos).where(eq(bingos.id, bingo.id)).get();
      if (!after) return;
      const userIds = changedRoleHolders(before, bingoRolesOfEveryone(db, after));
      if (userIds.length > 0) broadcast({ type: "access_changed", bingoId: bingo.id, payload: { userIds } });
    } catch (err) {
      log.warn("access change check failed", { err, bingoId: bingo.id });
    }
  });
  next();
}
