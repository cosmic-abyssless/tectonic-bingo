import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import sharp from "sharp";
import { serveImageVariants } from "./imageVariants";
import { mountClientApp } from "./clientApp";
import { uploadsStaticOptions } from "./staticCaching";

sharp.cache(false);

let outer: string;
let server: Server;
let base: string;

beforeAll(async () => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), "static-caching-"));
  const uploads = path.join(outer, "uploads");
  const dist = path.join(outer, "dist");
  fs.mkdirSync(uploads);
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  await sharp({ create: { width: 800, height: 400, channels: 3, background: "#3366cc" } }).png().toFile(path.join(uploads, "shot.png"));
  fs.writeFileSync(path.join(uploads, "broken.png"), "not an image");
  fs.writeFileSync(path.join(dist, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(dist, "favicon.svg"), "<svg/>");
  fs.writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");

  const app = express();
  app.use("/uploads", serveImageVariants(uploads), express.static(uploads, uploadsStaticOptions));
  // The real wiring (static assets, the page with its runtime config, the SPA fallback), not a copy of it.
  mountClientApp(app, dist, {});
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const cacheControl = async (url: string, init?: RequestInit) => (await fetch(`${base}${url}`, init)).headers.get("cache-control");

describe("uploads caching", () => {
  it("serves originals and variants for a year, immutable, with no validators", async () => {
    const original = await fetch(`${base}/uploads/shot.png`);
    expect(original.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(original.headers.get("etag")).toBeNull();

    // First request generates the variant on demand; it is then served by the same static handler.
    const variant = await fetch(`${base}/uploads/shot-thumb.webp`);
    expect(variant.status).toBe(200);
    expect(variant.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await cacheControl("/uploads/shot-full.webp")).toBe("public, max-age=31536000, immutable");
  });

  it("never caches the redirect to the original when a variant can't be generated", async () => {
    const res = await fetch(`${base}/uploads/broken-thumb.webp`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does not mark a 404 immutable", async () => {
    const res = await fetch(`${base}/uploads/nothing.png`);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control") ?? "").not.toContain("immutable");
  });
});

describe("built client caching", () => {
  it("makes hashed assets immutable", async () => {
    expect(await cacheControl("/assets/app-abc123.js")).toBe("public, max-age=31536000, immutable");
  });

  it("makes index.html revalidate, both directly and via the SPA fallback", async () => {
    expect(await cacheControl("/index.html")).toBe("no-cache");
    expect(await cacheControl("/")).toBe("no-cache");
    expect(await cacheControl("/b/some-bingo/mod")).toBe("no-cache");
  });

  it("leaves other files on express's default", async () => {
    const cc = (await cacheControl("/favicon.svg")) ?? "";
    expect(cc).not.toContain("immutable");
    expect(cc).not.toBe("no-cache");
  });
});
