// The Buy-ins page (CONTEXT.md "Staff"), mounted at /api/bingos/:slug/buyins: the signups' Buy-ins and marking them,
// for whoever may (view_buyins, mark_buyins): the bingo's Staff while Buy-ins are collected, and its Moderators and
// Admins. Nothing here hands out more of a signup than its Buy-in (signupService.getBuyins), so Staff never see signup
// answers, stats or Pick Ratings, and nothing else of the bingo.
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Action, BuyinsResponse } from "@bingo/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireBingo } from "../middleware/requireBingo";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db";
import * as signupService from "../services/signupService";
import { assertCan, bingoRoles, restrictionsOf } from "../services/permissions";
import { ServiceError } from "../services/errors";
import { broadcast } from "../ws";

const router = Router({ mergeParams: true });

/** Lets through whoever may take `action` here now, and says in the audit log which role they took it as. */
function requireBuyinAction(action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = bingoRoles(db, req.bingo!, req.user!);
    assertCan(roles, req.bingo!, action, { role: new ServiceError(403, "Staff access required for this bingo") }, restrictionsOf(db, req.bingo!.id, req.user!.id));
    if (req.audit) req.audit.actorRole = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "mod" : "staff";
    next();
  };
}

router.use(requireAuth, requireBingo);

router.get(
  "/",
  requireBuyinAction("view_buyins"),
  asyncHandler(async (req, res) => {
    res.json(signupService.getBuyins(db, req.bingo!.id) satisfies BuyinsResponse);
  }),
);

router.patch(
  "/:signupId",
  requireBuyinAction("mark_buyins"),
  asyncHandler(async (req, res) => {
    const { received, collectedByUserId } = req.body as { received?: boolean; collectedByUserId?: string | null };
    if (typeof received !== "boolean") throw new ServiceError(400, "received must be a boolean");
    signupService.markBuyin(db, req.bingo!, req.params.signupId as string, { received, collectedByUserId, recordedByUserId: req.user!.id });
    broadcast({ type: "signup_changed", bingoId: req.bingo!.id, payload: {} });
    res.status(204).end();
  }),
);

export default router;
