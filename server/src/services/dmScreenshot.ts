// The screenshot a Discord DM about one drop carries (CONTEXT.md "Notification"): only for a drop of the recipient's own
// Team (Team drop approved, Your drop rejected), whose screenshots they can always see, and only in a DM about that one
// drop, never a fold of several. Downsized, so a DM stays a couple of hundred KB however large the upload was. A
// screenshot that can't be read is left out and the DM goes without it.
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { NotificationKind } from "@bingo/shared";
import * as schema from "../db/schema";
import { submissionScreenshots } from "../db/schema";
import { UPLOADS_DIR } from "../config";
import { log } from "../log";

type Db = BetterSQLite3Database<typeof schema>;

/** The kinds whose single-drop DMs carry its screenshot: each goes only to the drop's own Team. */
export const SCREENSHOT_KINDS: ReadonlySet<NotificationKind> = new Set(["team_drop_approved", "drop_rejected"]);

/** Wide enough to read a drop and its Codeword, small enough to keep a DM light. */
export const DM_IMAGE_MAX_WIDTH = 1000;
export const DM_IMAGE_WEBP_QUALITY = 75;

export interface DmImage {
  name: string;
  data: Buffer;
}

/** Which of a Submission's screenshots a DM shows: the main one, else its Proof screenshot, else whichever there is. */
const PREFERENCE = ["main", "proof"] as const;

/** The file a screenshot's `/uploads/...` URL names, or null for anything outside the uploads directory. */
export function uploadPath(storageUrl: string): string | null {
  if (!storageUrl.startsWith("/uploads/")) return null;
  const root = path.resolve(UPLOADS_DIR);
  const file = path.resolve(root, storageUrl.slice("/uploads/".length));
  return file.startsWith(root + path.sep) ? file : null;
}

/** The downsized screenshot of a Submission, for its DM; null when it has none that can be read. */
export async function dmScreenshot(db: Db, submissionId: string): Promise<DmImage | null> {
  const shots = db
    .select({ type: submissionScreenshots.screenshotType, url: submissionScreenshots.storageUrl })
    .from(submissionScreenshots)
    .where(eq(submissionScreenshots.submissionId, submissionId))
    .all()
    .filter((s) => s.url);
  const rank = (type: string) => {
    const i = (PREFERENCE as readonly string[]).indexOf(type);
    return i === -1 ? PREFERENCE.length : i;
  };
  const shot = shots.sort((a, b) => rank(a.type) - rank(b.type))[0];
  const file = shot ? uploadPath(shot.url) : null;
  if (!file || !fs.existsSync(file)) return null;
  try {
    const data = await sharp(file).rotate().resize({ width: DM_IMAGE_MAX_WIDTH, withoutEnlargement: true }).webp({ quality: DM_IMAGE_WEBP_QUALITY }).toBuffer();
    return { name: "screenshot.webp", data };
  } catch (err) {
    log.warn("dm screenshot failed", { err, submissionId });
    return null;
  }
}
