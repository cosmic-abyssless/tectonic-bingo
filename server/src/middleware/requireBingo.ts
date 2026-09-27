import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { bingos } from "../db/schema";
import { isBingoMod } from "../services/bingoService";

// Resolves :slug on the route into req.bingo. Mount before any handler that
// needs the bingo — including requireBingoMod, which reads req.bingo.
// A Planning bingo is for its Moderators and Admins only: to anyone else it
// doesn't exist yet, so every route under it 404s (CONTEXT.md "Stage").
export async function requireBingo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const slug = req.params.slug as string;
  const [bingo] = await db.select().from(bingos).where(eq(bingos.slug, slug));
  if (!bingo || (bingo.stage === "planning" && !(req.user && isBingoMod(db, bingo.id, req.user.id, req.user.isAdmin)))) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  req.bingo = bingo;
  next();
}
