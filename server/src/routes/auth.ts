import { Router, Request, Response } from "express";
import passport from "passport";
import { eq } from "drizzle-orm";
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
if (process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true") {
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
