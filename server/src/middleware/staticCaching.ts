import fs from "fs";
import path from "path";
import express, { type RequestHandler } from "express";
import { requireGuildMemberLogin } from "./requireGuildMember";
import { serveImageVariants } from "./imageVariants";

type StaticOptions = NonNullable<Parameters<typeof express.static>[1]>;

// Uploaded files never change under a given URL: names are random (see
// newUploadName in upload.ts), a replaced tile image is a NEW file with a new
// URL, and the display variants are derived from the original by suffix and
// written once (imageVariants.ts). So they can be cached for a year without
// revalidating — the validators would only cost a round trip. Private, though:
// they need a clan login (serveUploads), so only the browser may keep a copy,
// never a shared cache.
export const UPLOADS_CACHE_CONTROL = "private, max-age=31536000, immutable";

export const uploadsStaticOptions: StaticOptions = {
  // Set by setHeaders instead, which only runs for a file that is served (so a 404 is never marked immutable).
  cacheControl: false,
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", UPLOADS_CACHE_CONTROL);
  },
};

/**
 * The /uploads route: Submission screenshots and Tile images, for logged-in clan members only (any of them may load
 * any file; there's no per-bingo check). Display variants are made on demand in front of the static files.
 */
export function serveUploads(dir: string): RequestHandler[] {
  return [requireGuildMemberLogin, serveImageVariants(dir), express.static(dir, uploadsStaticOptions)];
}

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// index.html names the current hashed bundles, so it must always revalidate (mountClientApp sets this on the page).
export const INDEX_HTML_CACHE_CONTROL = "no-cache";

/**
 * Static options for the built client. Vite content-hashes everything under
 * `/assets/`, so those are immutable; anything else (favicon, etc.) keeps
 * express.static's default. The page itself (`index.html`, which names the current
 * hashed bundles and so must always revalidate) is served by mountClientApp.
 */
export function clientDistStaticOptions(distDir: string): StaticOptions {
  const assetsDir = path.join(distDir, "assets") + path.sep;
  return {
    // The page itself is served by mountClientApp (with the runtime config injected), never straight off disk.
    index: false,
    setHeaders(res, filePath) {
      if (filePath.startsWith(assetsDir)) res.setHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    },
  };
}

type PrecompressedEncoding = "br" | "gzip";
const SUFFIX: Record<PrecompressedEncoding, string> = { br: ".br", gzip: ".gz" };

/**
 * Which precompressed copy an Accept-Encoding header allows, if any: the one with the higher q, Brotli on a tie (it is
 * the smaller). A q of 0 refuses that encoding, `*` stands for any encoding not named, and no header at all means
 * neither (a client that sends nothing gets the plain file).
 */
export function pickPrecompressedEncoding(acceptEncoding: string | undefined): PrecompressedEncoding | null {
  if (!acceptEncoding) return null;
  const q = new Map<string, number>();
  for (const part of acceptEncoding.split(",")) {
    const [rawName, ...params] = part.toLowerCase().split(";");
    const name = rawName.trim();
    if (!name) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const value = qParam ? Number(qParam.slice(2)) : 1;
    q.set(name === "x-gzip" ? "gzip" : name, Number.isFinite(value) ? value : 0);
  }
  const weight = (name: string) => q.get(name) ?? q.get("*") ?? 0;
  const br = weight("br");
  const gzip = weight("gzip");
  if (br > 0 && br >= gzip) return "br";
  return gzip > 0 ? "gzip" : null;
}

/**
 * Sends the build's Brotli or gzip copy of a hashed asset (client/vite.config.ts writes them beside the originals) as it
 * is, with the original's Content-Type, so compression() never gzips the bundle per request: it leaves a response that
 * already has a Content-Encoding alone. Mounted on /assets ahead of the static handler, which serves the plain file
 * when the client accepts neither encoding or there is no copy.
 *
 * Which copies exist is read once, when mounted: the build doesn't change under a running server, and a request can
 * only ever be answered from that list, so no path from a URL reaches the disk.
 */
export function precompressedAssets(assetsDir: string): RequestHandler {
  const copies = new Map<string, Set<PrecompressedEncoding>>();
  const files = fs.existsSync(assetsDir) ? (fs.readdirSync(assetsDir, { recursive: true }) as string[]) : [];
  const present = new Set(files.map((file) => file.split(path.sep).join("/")));
  for (const file of present) {
    for (const encoding of Object.keys(SUFFIX) as PrecompressedEncoding[]) {
      if (present.has(file + SUFFIX[encoding])) copies.set(file, (copies.get(file) ?? new Set()).add(encoding));
    }
  }

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let file: string;
    try {
      file = decodeURIComponent(req.path.slice(1));
    } catch {
      return next();
    }
    const available = copies.get(file);
    if (!available) return next();
    // Whichever representation goes out, a cache must key it on Accept-Encoding: the plain file isn't for a client that
    // takes Brotli, and the Brotli copy is unreadable to one that doesn't.
    res.vary("Accept-Encoding");
    const encoding = pickPrecompressedEncoding(req.get("Accept-Encoding"));
    if (!encoding || !available.has(encoding)) return next();

    res.type(path.extname(file));
    res.sendFile(
      path.join(assetsDir, file + SUFFIX[encoding]),
      { cacheControl: false, headers: { "Content-Encoding": encoding, "Cache-Control": IMMUTABLE_CACHE_CONTROL } },
      (err) => {
        // Gone from disk after all: fall back to the plain file rather than fail the request.
        if (err && !res.headersSent) {
          res.removeHeader("Content-Encoding");
          res.removeHeader("Content-Type");
          res.removeHeader("Cache-Control");
          next();
        }
      },
    );
  };
}
