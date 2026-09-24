import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { phoneLoginLinks, users } from "../db/schema";
import { now as clockNow } from "../clock";
import type { SessionUser } from "../types";

type Db = BetterSQLite3Database<typeof schema>;

// Logging in on a phone from a browser that's already logged in: the browser shows a QR code of a one-time link, the
// phone scans it and, after a confirm, is logged in as the same account. The phone never meets Discord's web login,
// which asks for a password most people only ever use the Discord app for.
//
// The link carries a random token (256 bits: not guessable, so no rate limit); only its hash is stored. A link works
// once and for LINK_TTL_MS, and an account has one live link at a time: making another retires the last.

export const LINK_TTL_MS = 2 * 60 * 1000;

export type PhoneLoginLinkStatus = "pending" | "used" | "expired";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new link for this account (retiring its unused ones), and the token for the QR code: shown once, never stored. */
export function createPhoneLoginLink(db: Db, userId: string): { id: string; token: string; expiresAt: Date } {
  const now = clockNow();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
  return db.transaction((tx) => {
    tx.delete(phoneLoginLinks).where(and(eq(phoneLoginLinks.userId, userId), isNull(phoneLoginLinks.usedAt))).run();
    // Nothing reads a link after it's expired or used, beyond the page that made it asking how it went: a day's grace.
    tx.delete(phoneLoginLinks).where(lt(phoneLoginLinks.expiresAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))).run();
    const row = tx.insert(phoneLoginLinks).values({ tokenHash: hashToken(token), userId, expiresAt }).returning().get();
    return { id: row.id, token, expiresAt };
  });
}

/** How the account's link went, for the page showing its QR code. A link it no longer has (replaced) reads as expired. */
export function getPhoneLoginLinkStatus(db: Db, id: string, userId: string): PhoneLoginLinkStatus {
  const row = db
    .select()
    .from(phoneLoginLinks)
    .where(and(eq(phoneLoginLinks.id, id), eq(phoneLoginLinks.userId, userId)))
    .get();
  if (!row) return "expired";
  if (row.usedAt) return "used";
  return row.expiresAt.getTime() > clockNow().getTime() ? "pending" : "expired";
}

/** The account a live link would log in as (for the phone's "Log in as …?"), without using it up; null if it's not live. */
export function previewPhoneLoginLink(db: Db, token: string): SessionUser | null {
  const row = db
    .select({ user: users })
    .from(phoneLoginLinks)
    .innerJoin(users, eq(users.id, phoneLoginLinks.userId))
    .where(and(eq(phoneLoginLinks.tokenHash, hashToken(token)), isNull(phoneLoginLinks.usedAt), gt(phoneLoginLinks.expiresAt, clockNow())))
    .get();
  return row?.user ?? null;
}

/** Uses up a live link and returns its account to log in as; null if it's not live (expired, used, or never was). */
export function redeemPhoneLoginLink(db: Db, token: string): SessionUser | null {
  const now = clockNow();
  // One statement, so two phones racing on the same link can't both get it.
  const used = db
    .update(phoneLoginLinks)
    .set({ usedAt: now })
    .where(and(eq(phoneLoginLinks.tokenHash, hashToken(token)), isNull(phoneLoginLinks.usedAt), gt(phoneLoginLinks.expiresAt, now)))
    .returning({ userId: phoneLoginLinks.userId })
    .get();
  if (!used) return null;
  return db.select().from(users).where(eq(users.id, used.userId)).get() ?? null;
}
