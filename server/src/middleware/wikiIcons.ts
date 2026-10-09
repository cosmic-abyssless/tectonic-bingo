import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, RequestHandler } from "express";
import { USER_AGENT } from "../config";
import { log } from "../log";

// A disk cache in front of the OSRS wiki's item icons, so players' browsers never
// contact the wiki: each icon is fetched once, stored under `dir`, and served
// from our origin with long cache headers. Misses are remembered too (the wiki
// doesn't have every name — bingo-specific labels like "Any Cerberus drop", or
// items whose file is named differently) so we don't keep asking.
//
// An item with variants (a pet like Baby chinchompa or Ikkle Hydra) has no icon under its own name, only one per
// variant ("Baby chinchompa (grey).png"). For a name with no icon of its own, the item's page is asked once which
// images it has, and the icon of its default variant (the one the page shows) is stored under the item's name.

const WIKI_IMAGES_URL = "https://oldschool.runescape.wiki/images/";
const WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";

export const ICON_MAX_BYTES = 64 * 1024;
export const ICON_FETCH_TIMEOUT_MS = 10_000;
export const ICON_MAX_CONCURRENT_FETCHES = 4;
/** How long a "the wiki has no such icon" answer is trusted. */
export const MISS_TTL_MS = 7 * 24 * 3600_000;
/** After a network/5xx failure, don't ask the wiki about that name again for this long. */
export const FAILURE_BACKOFF_MS = 60_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** The on-disk file name for an item — a hash, never the name itself, so nothing about the name can touch the filesystem. */
export function iconFileName(name: string): string {
  return `${crypto.createHash("sha1").update(name.trim()).digest("hex").slice(0, 16)}.png`;
}

/**
 * The on-disk marker for "the wiki has no icon for this name". Versioned: a name given up on before variant icons were
 * looked for (v1, plain ".miss") is asked about once more. Old markers are never read again.
 */
export function missFileName(name: string): string {
  return iconFileName(name).replace(/\.png$/, ".v2.miss");
}

/** The wiki's inventory-sprite URL convention: the title with underscores. */
export function wikiIconSourceUrl(name: string): string {
  return `${WIKI_IMAGES_URL}${encodeURIComponent(name.trim().replace(/ /g, "_"))}.png`;
}

/**
 * Of a page's image files, the inventory icon of the item's default variant: files named "<title> (<variant>).png"
 * (not the chathead, detail or follower pictures), preferring the variant of the page's own image ("grey" from
 * "Baby_Chinchompa_(grey).png", "serpentine" from "Ikkle_Hydra_(follower,_serpentine).png"), else the first.
 */
export function pickVariantIcon(title: string, files: string[], pageImage: string | null): string | null {
  const variantOf = (file: string): string | null => {
    const lower = file.toLowerCase();
    const prefix = `${title.toLowerCase()} (`;
    if (!lower.startsWith(prefix) || !lower.endsWith(").png")) return null;
    const variant = file.slice(prefix.length, -").png".length);
    return variant.includes("(") || variant.includes(")") || variant.toLowerCase().startsWith("follower") ? null : variant;
  };
  const icons = files.filter((f) => variantOf(f) !== null).sort((a, b) => Number(!a.startsWith(title)) - Number(!b.startsWith(title)) || a.localeCompare(b));
  const wanted = pageImage
    ?.replace(/_/g, " ")
    .match(/\(([^()]*)\)\.png$/)?.[1]
    ?.replace(/^follower,\s*/i, "")
    .toLowerCase();
  return icons.find((f) => variantOf(f)!.toLowerCase() === wanted) ?? icons[0] ?? null;
}

export interface WikiIconCacheOptions {
  /** Cache directory, e.g. path.join(UPLOADS_DIR, "wiki-icons"). */
  dir: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** false → never contact the wiki (E2E/CI): only already-cached icons are served. */
  enabled?: () => boolean;
}

/** hit: the icon is on disk. miss: the wiki has none. failed: couldn't find out (try again later). disabled: not allowed to ask. */
export type IconResult = "hit" | "miss" | "failed" | "disabled";

export interface WikiIconCache {
  /** What's already known about a name without asking the wiki: "hit" (on disk), "miss" (the wiki has none), or null. */
  cached(name: string): "hit" | "miss" | null;
  /** Resolves a name to a cached icon, fetching it from the wiki if needed. */
  ensure(name: string): Promise<IconResult>;
  /** Absolute path of the cached icon (which exists once ensure() resolves "hit"). */
  iconPath(name: string): string;
}

export function createWikiIconCache(opts: WikiIconCacheOptions): WikiIconCache {
  const dir = path.resolve(opts.dir);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const enabled = opts.enabled ?? (() => true);

  const inFlight = new Map<string, Promise<IconResult>>();
  const failedUntil = new Map<string, number>();

  // At most N simultaneous wiki fetches; a slot is handed straight to the next waiter.
  let active = 0;
  const waiting: (() => void)[] = [];
  async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= ICON_MAX_CONCURRENT_FETCHES) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }

  const iconPath = (name: string) => path.join(dir, iconFileName(name));
  const missPath = (name: string) => path.join(dir, missFileName(name));
  const headers = { "User-Agent": `${USER_AGENT} icon cache` };

  /** The wiki answering with an error: reported to Sentry (log.error with the error), then thrown like any other failure. */
  function unexpectedAnswer(url: string, status: number): Error {
    const err = new Error(`unexpected response ${status}`);
    log.error("wiki icon fetch failed", { url, status, err });
    return err;
  }

  /** The PNG at `url`, or null when the wiki has no such file. Throws on anything else (a network error, a 5xx, not a small PNG). */
  async function downloadPng(url: string): Promise<Buffer | null> {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(ICON_FETCH_TIMEOUT_MS) });
    if (res.status === 404) return null;
    if (!res.ok) throw unexpectedAnswer(url, res.status);
    if (!(res.headers.get("content-type") ?? "").startsWith("image/png")) throw new Error(`unexpected response ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > ICON_MAX_BYTES || !body.subarray(0, 4).equals(PNG_SIGNATURE)) throw new Error("not a small PNG");
    return body;
  }

  /** For an item with variants: its default variant's icon file ("Baby chinchompa (grey).png"), or null if it has none. */
  async function variantIconFile(name: string): Promise<string | null> {
    const params = new URLSearchParams({ action: "query", titles: name, prop: "images|pageimages", imlimit: "500", piprop: "name", redirects: "1", format: "json" });
    const res = await fetchImpl(`${WIKI_API_URL}?${params}`, { headers, signal: AbortSignal.timeout(ICON_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw unexpectedAnswer(WIKI_API_URL, res.status);
    const body = (await res.json()) as { query?: { pages?: Record<string, { title?: string; pageimage?: string; images?: { title: string }[] }> } };
    const page = Object.values(body.query?.pages ?? {})[0];
    if (!page?.images) return null;
    return pickVariantIcon(page.title ?? name, page.images.map((i) => i.title.replace(/^File:/, "")), page.pageimage ?? null);
  }

  async function fetchIcon(name: string): Promise<IconResult> {
    const file = iconPath(name);
    const marker = missPath(name);
    try {
      let body = await downloadPng(wikiIconSourceUrl(name));
      if (!body) {
        const variant = await variantIconFile(name);
        body = variant ? await downloadPng(wikiIconSourceUrl(variant.replace(/\.png$/, ""))) : null;
      }
      if (!body) {
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(marker, "");
        return "miss";
      }

      await fs.promises.mkdir(dir, { recursive: true });
      // Temp file + rename, so a request never reads a half-written icon.
      const tmp = `${file}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
      await fs.promises.writeFile(tmp, body);
      await fs.promises.rename(tmp, file);
      await fs.promises.rm(marker, { force: true });
      return "hit";
    } catch (err) {
      console.warn(`[wiki-icons] fetching "${name}" failed:`, err instanceof Error ? err.message : err);
      failedUntil.set(iconFileName(name), now() + FAILURE_BACKOFF_MS);
      return "failed";
    }
  }

  function cached(rawName: string): "hit" | "miss" | null {
    const name = rawName.trim();
    if (fs.existsSync(iconPath(name))) return "hit";
    try {
      if (now() - fs.statSync(missPath(name)).mtimeMs < MISS_TTL_MS) return "miss";
    } catch {
      // No marker (or an unreadable one): nothing known yet.
    }
    return null;
  }

  return {
    iconPath,
    cached,
    ensure(rawName) {
      const name = rawName.trim();
      const key = iconFileName(name);
      const known = cached(name);
      if (known) return Promise.resolve(known);
      if (!enabled()) return Promise.resolve("disabled");
      if ((failedUntil.get(key) ?? 0) > now()) return Promise.resolve("failed");

      let pending = inFlight.get(key);
      if (!pending) {
        pending = withSlot(() => fetchIcon(name)).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },
  };
}

export interface WikiIconOptions extends WikiIconCacheOptions {
  /**
   * Whether this request may make us ask the wiki about a name we know nothing about yet. An icon already cached (or
   * a name the wiki is known not to have) is answered for anyone; only a first lookup is gated, so the server can't
   * be used as an open proxy to the wiki.
   */
  mayLookUp: (name: string, req: Request) => boolean;
}

const MAX_NAME_LENGTH = 120;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[ -]/;

/**
 * Serves `GET /<encodeURIComponent(name)>.png` (mount at /wiki-icons). Public
 * reference data, cached for 30 days — not `immutable`, since wiki art is rarely
 * but not never updated and the URL isn't content-addressed.
 */
export function serveWikiIcons(opts: WikiIconOptions): RequestHandler {
  const cache = createWikiIconCache(opts);
  const notFound = (res: Parameters<RequestHandler>[1], cacheControl: string) => {
    res.status(404).set("Cache-Control", cacheControl).end();
  };

  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let name: string;
    try {
      const match = /^\/(.+)\.png$/.exec(req.path);
      name = match ? decodeURIComponent(match[1]!).trim() : "";
    } catch {
      name = "";
    }
    if (!name || name.length > MAX_NAME_LENGTH || CONTROL_CHARS.test(name)) return notFound(res, "no-store");
    if (!cache.cached(name) && !opts.mayLookUp(name, req)) return notFound(res, "no-store");

    const result = await cache.ensure(name);
    if (result === "hit") {
      return res.sendFile(cache.iconPath(name), { maxAge: "30d" }, (err) => {
        if (err && !res.headersSent) notFound(res, "no-store");
      });
    }
    // A miss is a real answer (a day is plenty); anything else may resolve later.
    return notFound(res, result === "miss" ? "public, max-age=86400" : "no-store");
  };
}
