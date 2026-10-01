import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { bingos } from "../db/schema";
import { can } from "@bingo/shared";
import { bingoRoles } from "../services/permissions";

/** What every write to a Historical Bingo (CONTEXT.md) answers. */
export const HISTORICAL_READ_ONLY = "Historical Bingos are read-only";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Resolves :slug on the route into req.bingo. Mount before any handler that
// needs the bingo — including requireBingoMod, which reads req.bingo.
// A Planning bingo is for its Moderators and Admins only (view_bingo): to anyone
// else it doesn't exist yet, so every route under it 404s (CONTEXT.md "Stage").
// A Historical Bingo is read-only: every write under it (stage, Board, Teams, signups, Submissions, reactions…) is
// refused here, in one place, rather than route by route. Deleting one goes through the Site admin's
// DELETE /api/admin/bingos/:id, which doesn't pass through here.
export async function requireBingo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const slug = req.params.slug as string;
  const [bingo] = await db.select().from(bingos).where(eq(bingos.slug, slug));
  if (!bingo || (bingo.stage === "planning" && !(req.user && can(bingoRoles(db, bingo, req.user), bingo, "view_bingo").ok))) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  if (bingo.historical && !READ_METHODS.has(req.method)) {
    res.status(409).json({ error: HISTORICAL_READ_ONLY });
    return;
  }
  req.bingo = bingo;
  next();
}
