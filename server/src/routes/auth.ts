import { Router, Request, Response } from "express";
import passport from "passport";

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

export default router;
