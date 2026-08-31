import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { bingoModerators } from "../db/schema";

// Mount after requireAuth and requireBingo. A site admin is implicitly a mod
// of every bingo.
export async function requireBingoMod(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.bingo) {
    res.status(500).json({ error: "requireBingoMod must run after requireBingo" });
    return;
  }
  if (req.user.isAdmin) {
    next();
    return;
  }
  const [mod] = await db
    .select()
    .from(bingoModerators)
    .where(and(eq(bingoModerators.bingoId, req.bingo.id), eq(bingoModerators.userId, req.user.id)));
  if (!mod) {
    res.status(403).json({ error: "Moderator access required for this bingo" });
    return;
  }
  next();
}
