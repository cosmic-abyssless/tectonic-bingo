import { devAdminOff, isDevModeActive } from "../devMode";
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { noStore } from "../middleware/cacheControl";
import { isOwner } from "../services/permissions";
import { auditSkip } from "../audit/middleware";
import { db } from "../db";
import { markTutorialSeen } from "../services/userService";

const router = Router();

// noStore first, so the 401 for a signed-out caller is uncached too.
router.get("/", noStore, requireAuth, (req, res) => {
  const devMode = isDevModeActive();
  // isOwner: for the Owner's Actions on the Site admin pages (siteRoles); not while their admin powers are off. An admin
  // with their admin powers switched off (devMode.ts): req.user reads as a non-admin, so devAdminOff is how the account
  // switcher knows to offer them back.
  res.json({ user: req.user, devMode, isOwner: isOwner(req.user!), devAdminOff: devAdminOff(req.session) });
});

// The Tutorial (CONTEXT.md) was finished or skipped, so it doesn't start again on any device. Answers with the
// viewer's record, as GET / does.
router.post(
  "/tutorial-seen",
  noStore,
  requireAuth,
  auditSkip("the account has seen the Tutorial: UI state, like account-level actions, nothing to audit"),
  (req, res) => {
    res.json({ user: markTutorialSeen(db, req.user!.id) });
  },
);

export default router;
