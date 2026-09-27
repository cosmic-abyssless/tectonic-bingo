import type { NextFunction, Request, Response } from "express";
import { db } from "../db";
import { getBingoAccess } from "../services/bingoAccess";

// Mount after requireAuth and requireBingo, on every route that serves a bingo's content (board, stats, teams,
// players…). Lets through whoever can see the bingo (bingoAccess.getBingoAccess: its Players, Moderators and Admins,
// and every clan member once it's Finished) and attaches their standing as req.bingoAccess.
export function requireBingoViewer(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.bingo) {
    res.status(500).json({ error: "requireBingoViewer must run after requireBingo" });
    return;
  }
  const access = getBingoAccess(db, req.bingo, req.user);
  if (!access.canSee) {
    res.status(403).json({ error: "You're not part of this bingo" });
    return;
  }
  req.bingoAccess = access;
  next();
}
