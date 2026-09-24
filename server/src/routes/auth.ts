import { isDevModeActive } from "../devMode";
import { Router, Request, Response } from "express";
import passport from "passport";
import { eq, notLike } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { devPageAccess } from "../services/devPageAccessService";
import { requireAuth } from "../middleware/requireAuth";
import { noStore } from "../middleware/cacheControl";
import { LINK_TTL_MS, createPhoneLoginLink, getPhoneLoginLinkStatus, previewPhoneLoginLink, redeemPhoneLoginLink } from "../services/phoneLoginService";

const router = Router();

// Initiate Discord OAuth2 flow
router.get("/discord", passport.authenticate("discord"));

// Discord OAuth2 callback
router.get(
  "/discord/callback",
  passport.authenticate("discord", { failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed` }),
  (_req: Request, res: Response) => {
    res.redirect(`${process.env.CLIENT_URL}/`);
  }
);

// Log in on a phone from a browser that's already logged in (services/phoneLoginService.ts). The browser makes a
// one-time link and shows it as a QR code; the phone opens it, is shown who it will log in as, and confirms. The token
// travels in request bodies (and the link's #fragment), never a URL path or query, so it stays out of request logs.
router.post("/phone-link", requireAuth, (req: Request, res: Response) => {
  const link = createPhoneLoginLink(db, req.user!.id);
  // How long it lasts rather than when it ends, so the page's countdown doesn't hang on its clock matching ours.
  res.json({ id: link.id, token: link.token, expiresInSeconds: Math.round(LINK_TTL_MS / 1000) });
});

// The page showing the QR code asks how its link went, to say so once the phone is in.
router.get("/phone-link/:id", noStore, requireAuth, (req: Request<{ id: string }>, res: Response) => {
  res.json({ status: getPhoneLoginLinkStatus(db, req.params.id, req.user!.id) });
});

function tokenFrom(req: Request): string | null {
  const token = (req.body as { token?: unknown } | undefined)?.token;
  return typeof token === "string" && token.length > 0 && token.length <= 100 ? token : null;
}

const LINK_GONE = "This login code has expired or was already used. Show a new one on your computer.";

// Who the link would log in as, without using it up: the phone asks before it logs in, so a link opened by a preview
// or a scanner app on its own doesn't use it up (or log anyone in).
router.post("/phone-link/preview", (req: Request, res: Response) => {
  const token = tokenFrom(req);
  const user = token ? previewPhoneLoginLink(db, token) : null;
  if (!user) {
    res.status(410).json({ error: LINK_GONE });
    return;
  }
  const { discordId, discordUsername, discordGlobalName, discordGuildNick, discordAvatar } = user;
  res.json({ user: { discordId, discordUsername, discordGlobalName, discordGuildNick, discordAvatar } });
});

router.post("/phone-link/redeem", (req: Request, res: Response) => {
  const token = tokenFrom(req);
  const user = token ? redeemPhoneLoginLink(db, token) : null;
  if (!user) {
    res.status(410).json({ error: LINK_GONE });
    return;
  }
  // The same session machinery as a Discord login (a fresh session id, the user id stored in it).
  req.login(user, (err) => {
    if (err) {
      res.status(500).json({ error: "Login failed" });
      return;
    }
    res.json({ success: true });
  });
});

// Logout
router.post("/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

// Dev-only login shortcut so local flows can be exercised (e.g. with curl)
// without a real Discord OAuth round trip. Logs in as an existing seeded
// user by discordId, through the real session machinery (req.login uses the
// same serializeUser/deserializeUser as a real login). Never available
// unless explicitly enabled.
if (isDevModeActive()) {
  // Unauthenticated on purpose — it's how you log in — but only exists at
  // all under the same dev gate as the login endpoint below. Excludes
  // "dev-seed-*" throwaway test bots (a since-removed seed tool's leftovers,
  // if a dev DB still has any) so the list stays focused on real accounts
  // worth switching into.
  // ?path=<a client page>: each user also says whether they could open that page and who they are in its bingo
  // (services/devPageAccessService.ts), for the header's account switcher to dim the ones who'd be turned away.
  router.get("/dev-users", async (req: Request, res: Response) => {
    const rows = await db.select().from(users).where(notLike(users.discordId, "dev-seed-%")).orderBy(users.discordUsername);
    const path = typeof req.query.path === "string" ? req.query.path : null;
    if (!path) {
      res.json({ users: rows });
      return;
    }
    const access = devPageAccess(db, path, rows);
    res.json({ users: rows.map((u) => ({ ...u, ...access.get(u.id) })) });
  });

  // By discordId, or by our own userId (what a player's profile has: the dev "View as" button).
  router.post("/dev-login", async (req: Request, res: Response) => {
    const { discordId, userId } = req.body as { discordId?: string; userId?: string };
    if (!discordId && !userId) {
      res.status(400).json({ error: "discordId or userId is required" });
      return;
    }
    const [user] = await db.select().from(users).where(discordId ? eq(users.discordId, discordId) : eq(users.id, userId!));
    if (!user) {
      res.status(404).json({ error: "No user with that discordId — seed one first" });
      return;
    }
    req.login(user, (err) => {
      if (err) {
        res.status(500).json({ error: "Login failed" });
        return;
      }
      res.json({ user });
    });
  });
}

export default router;
