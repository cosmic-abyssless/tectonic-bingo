import fs from "fs";
import path from "path";
import type { RequestHandler } from "express";
import { VARIANT_NAME_RE, generateVariants } from "../services/imageService";

// Sits in front of the static /uploads route. A request for a display variant
// (`…-thumb.webp` / `…-full.webp`) that doesn't exist yet — an image uploaded
// before variants existed, an upload whose background generation hasn't
// finished, or one where it failed — is generated on the spot from the
// original and then served like any other file. If it can't be generated, the
// request is redirected to the original, so a variant URL never 404s while
// the original exists.

// One generation per original at a time: a board of tiles asks for the same
// missing variant from many places at once.
const inFlight = new Map<string, Promise<unknown>>();

async function findOriginal(dir: string, base: string): Promise<string | null> {
  const entries = await fs.promises.readdir(dir);
  return entries.find((name) => path.parse(name).name === base && !VARIANT_NAME_RE.test(name)) ?? null;
}

export function serveImageVariants(rootDir: string): RequestHandler {
  const root = path.resolve(rootDir);
  return async (req, res, next) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const rel = decodeURIComponent(req.path);
      const match = VARIANT_NAME_RE.exec(path.posix.basename(rel));
      if (!match) return next();

      const variantPath = path.resolve(root, `.${path.posix.normalize(rel)}`);
      if (!variantPath.startsWith(root + path.sep)) return next();
      if (fs.existsSync(variantPath)) return next();

      const dir = path.dirname(variantPath);
      const originalName = await findOriginal(dir, match[1]!).catch(() => null);
      if (!originalName) return next();

      const originalPath = path.join(dir, originalName);
      let pending = inFlight.get(originalPath);
      if (!pending) {
        pending = generateVariants(originalPath).finally(() => inFlight.delete(originalPath));
        inFlight.set(originalPath, pending);
      }
      await pending;

      if (fs.existsSync(variantPath)) return next();
      // Not cacheable: a variant that couldn't be made now may be makeable later,
      // and the static handler serves variants with a year-long cache.
      res.set("Cache-Control", "no-store");
      res.redirect(`${req.baseUrl}${path.posix.join(path.posix.dirname(rel), originalName)}`);
    } catch {
      next();
    }
  };
}
