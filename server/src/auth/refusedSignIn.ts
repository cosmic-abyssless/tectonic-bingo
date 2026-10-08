// The Discord login callback's handling of a refused sign-in code (routes/auth.ts), apart so it's testable without the
// database or passport's strategy.

import type { NextFunction, Request, Response } from "express";
import { log } from "../log";

/**
 * Discord refused the sign-in code (passport-oauth2's TokenError: already used, or expired). Seen when the callback is
 * requested twice with one code, e.g. refreshed a moment after signing in (TECTONIC-SERVER-3): the first request signed
 * them in, the second can't. Passport raises it as an error, not a failure, so failureRedirect doesn't apply and it
 * reached the error handler: a 500 page, reported to Sentry. Instead: home if they're signed in, else the login page
 * with its usual message. Any other error (Discord unreachable, say) goes on to the error handler as before.
 */
export function onRefusedSignInCode(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (!(err instanceof Error) || err.name !== "TokenError") {
    next(err);
    return;
  }
  const signedIn = req.isAuthenticated?.() ?? false;
  log.warn("discord sign-in code refused", { code: (err as { code?: unknown }).code, signedIn });
  res.redirect(signedIn ? `${process.env.CLIENT_URL}/` : `${process.env.CLIENT_URL}/login?error=auth_failed`);
}
