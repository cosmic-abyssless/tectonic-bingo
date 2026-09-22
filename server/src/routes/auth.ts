import { isDevModeActive } from "../devMode";
import { Router, Request, Response } from "express";
import passport from "passport";
import { eq, notLike } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

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
  router.get("/dev-users", async (_req: Request, res: Response) => {
    const rows = await db.select().from(users).where(notLike(users.discordId, "dev-seed-%")).orderBy(users.discordUsername);
    res.json({ users: rows });
  });

  router.post("/dev-login", async (req: Request, res: Response) => {
    const { discordId } = req.body as { discordId?: string };
    if (!discordId) {
      res.status(400).json({ error: "discordId is required" });
      return;
    }
    const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
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
