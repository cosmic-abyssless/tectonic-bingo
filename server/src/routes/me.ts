import { devAdminOff, isDevModeActive } from "../devMode";
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { noStore } from "../middleware/cacheControl";
import { isOwner, siteRoles } from "../services/permissions";
import { auditSkip } from "../audit/middleware";
import { db } from "../db";
import { markTutorialSeen } from "../services/userService";
import { asyncHandler } from "../middleware/errorHandler";
import { ServiceError } from "../services/errors";
import { can, type NotificationInboxResponse, type NotificationSettingsResponse, type UserSettingsPatch } from "@bingo/shared";
import * as notificationService from "../services/notificationService";
import { answerOffer, assertOffer, claimOffer } from "../services/notificationOffers";
import { discordDmsAvailable, sendTestDm } from "../services/notificationDm";
import * as userSettingsService from "../services/userSettingsService";
import * as mcpConnections from "../mcp/connections";

const router = Router();

// noStore first, so the 401 for a signed-out caller is uncached too.
router.get("/", noStore, requireAuth, (req, res) => {
  const devMode = isDevModeActive();
  // isOwner: for the Owner's Actions on the Site admin pages (siteRoles); not while their admin powers are off. An admin
  // with their admin powers switched off (devMode.ts): req.user reads as a non-admin, so devAdminOff is how the account
  // switcher knows to offer them back.
  res.json({ user: req.user, devMode, isOwner: isOwner(req.user!), devAdminOff: devAdminOff(req.session) });
});

// The viewer's own Claude connections to the MCP server ("Connected apps" in the account menu): a site admin's, or a user's
// with MCP access (CONTEXT.md). Anyone may list and revoke their own; nobody else's here (Owners do that from Site admin).
router.get("/mcp-connections", noStore, requireAuth, (req, res) => {
  res.json({ connections: mcpConnections.listConnections(db, req.user!.id) });
});

router.delete(
  "/mcp-connections/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    mcpConnections.revokeConnection(db, req.params.id as string, { id: req.user!.id, isSiteAdmin: false });
    res.status(204).end();
  }),
);

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

// The viewer's User settings (shared userSettings.ts): the Settings page's, kept on the account. UI state, like the
// Tutorial's: nothing to audit.
router.get("/settings", noStore, requireAuth, (req, res) => {
  res.json(userSettingsService.getSettings(db, req.user!.id));
});

router.put(
  "/settings",
  noStore,
  requireAuth,
  auditSkip("the account's own User settings: UI state, nothing to audit"),
  (req, res) => {
    res.json(userSettingsService.updateSettings(db, req.user!.id, (req.body ?? {}) as UserSettingsPatch));
  },
);

// ---------------------------------------------------------------------------
// Notifications (CONTEXT.md "Notification", "Inbox", "Catch-up"): the viewer's own settings and Inbox. Account-level UI
// state, like the Tutorial's: nothing to audit.
// ---------------------------------------------------------------------------

function settingsResponse(user: Express.User): NotificationSettingsResponse {
  const since = notificationService.discordUnreachableSince(db, user.id);
  return {
    settings: notificationService.getSettings(db, user.id),
    groups: notificationService.groupsFor(db, user),
    discordAvailable: discordDmsAvailable(),
    discordUnreachableSince: since?.toISOString() ?? null,
  };
}

router.get("/notifications/settings", noStore, requireAuth, (req, res) => {
  res.json(settingsResponse(req.user!));
});

router.put(
  "/notifications/settings",
  noStore,
  requireAuth,
  auditSkip("the account's own notification settings: UI state, nothing to audit"),
  (req, res) => {
    const patch = (req.body ?? {}) as notificationService.SettingsPatch;
    if (patch.level === "discord" && !discordDmsAvailable()) throw new ServiceError(400, "Discord DMs aren't set up on this server");
    notificationService.updateSettings(db, req.user!.id, patch);
    res.json(settingsResponse(req.user!));
  },
);

// The Mod panel's one-time line for a Moderator whose browser already showed its old submission alerts: Keep them.
router.post(
  "/notifications/keep-mod-alerts",
  noStore,
  requireAuth,
  auditSkip("the account's own notification settings: UI state, nothing to audit"),
  (req, res) => {
    notificationService.setOnlyKinds(db, req.user!.id, "browser", ["submissions_waiting"]);
    res.json(settingsResponse(req.user!));
  },
);

router.post(
  "/notifications/discord-test",
  noStore,
  requireAuth,
  auditSkip("a test DM to the account itself: nothing to audit"),
  asyncHandler(async (req, res) => {
    // Anyone Discord refused may try again; anyone else only as a Site admin, checking that DMs go out at all.
    if (!notificationService.discordUnreachableSince(db, req.user!.id) && !can(siteRoles(req.user!), null, "administer_site").ok) {
      throw new ServiceError(403, "Only Site admins can send a test DM");
    }
    const result = await sendTestDm(db, req.user!);
    res.json({ ...result, ...settingsResponse(req.user!) });
  }),
);

router.get("/notifications", noStore, requireAuth, (req, res) => {
  const inbox: NotificationInboxResponse = notificationService.getInbox(db, req.user!.id);
  res.json(inbox);
});

router.post(
  "/notifications/read",
  noStore,
  requireAuth,
  auditSkip("the Inbox was opened: UI state, nothing to audit"),
  (req, res) => {
    if (notificationService.markAllRead(db, req.user!.id) > 0) notificationService.inboxChanged([req.user!.id]);
    res.json(notificationService.getInbox(db, req.user!.id));
  },
);

router.post(
  "/notifications/read-mod-queue",
  noStore,
  requireAuth,
  auditSkip("the Mod panel's Submissions tab was opened: UI state, nothing to audit"),
  (req, res) => {
    const { bingoId } = (req.body ?? {}) as { bingoId?: unknown };
    if (typeof bingoId !== "string" || !bingoId) throw new ServiceError(400, "bingoId is required");
    if (notificationService.markReadInBingo(db, req.user!.id, bingoId, notificationService.MOD_QUEUE_KINDS) > 0) notificationService.inboxChanged([req.user!.id]);
    res.json(notificationService.getInbox(db, req.user!.id));
  },
);

router.delete(
  "/notifications",
  noStore,
  requireAuth,
  auditSkip("the account's own Inbox was cleared: UI state, nothing to audit"),
  (req, res) => {
    if (notificationService.clearInbox(db, req.user!.id) > 0) notificationService.inboxChanged([req.user!.id]);
    res.json(notificationService.getInbox(db, req.user!.id));
  },
);

function offerBody(req: import("express").Request): { bingoId: string; offer: ReturnType<typeof assertOffer> } {
  const { bingoId, offer } = (req.body ?? {}) as { bingoId?: unknown; offer?: unknown };
  if (typeof bingoId !== "string" || !bingoId) throw new ServiceError(400, "bingoId is required");
  return { bingoId, offer: assertOffer(offer) };
}

router.post(
  "/notifications/offers/claim",
  noStore,
  requireAuth,
  auditSkip("whether to show the account an offer: UI state, nothing to audit"),
  (req, res) => {
    const { bingoId, offer } = offerBody(req);
    res.json({ show: claimOffer(db, req.user!.id, bingoId, offer) });
  },
);

router.post(
  "/notifications/offers/answer",
  noStore,
  requireAuth,
  auditSkip("the account's answer to an offer: UI state, nothing to audit"),
  (req, res) => {
    const { bingoId, offer } = offerBody(req);
    answerOffer(db, req.user!.id, bingoId, offer, (req.body as { accepted?: unknown }).accepted === true);
    res.json(settingsResponse(req.user!));
  },
);

export default router;
