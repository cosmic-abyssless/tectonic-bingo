import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import sharp from "sharp";
import { mountClientApp } from "./clientApp";
import { serveUploads } from "./staticCaching";

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
  // Stands in for the session: a request says who it is with a header (none: logged out).
  const users: Record<string, Partial<Express.User>> = {
    member: { id: "u1", inGuild: true, isAdmin: false },
    outsider: { id: "u2", inGuild: false, isAdmin: false },
    admin: { id: "u3", inGuild: false, isAdmin: true },
  };
  app.use((req, _res, next) => {
    const who = req.get("x-test-user");
    if (who) req.user = users[who] as Express.User;
    next();
  });
  app.use("/uploads", ...serveUploads(uploads));
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
const as = (who: string): RequestInit => ({ headers: { "x-test-user": who } });

describe("uploads access", () => {
  it("turns away a request with no login: a bare 401, no redirect, no page", async () => {
    for (const url of ["/uploads/shot.png", "/uploads/shot-thumb.webp", "/uploads/nothing.png"]) {
      const res = await fetch(`${base}${url}`, { redirect: "manual" });
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
  });

  it("turns away a logged-in user who isn't in the clan's Discord server", async () => {
    const res = await fetch(`${base}/uploads/shot.png`, as("outsider"));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
  });

  it("serves a clan member, and a site admin from outside the server", async () => {
    expect((await fetch(`${base}/uploads/shot.png`, as("member"))).status).toBe(200);
    expect((await fetch(`${base}/uploads/shot.png`, as("admin"))).status).toBe(200);
  });
});

describe("uploads caching", () => {
  it("serves originals and variants for a year, immutable, browser cache only, with no validators", async () => {
    const original = await fetch(`${base}/uploads/shot.png`, as("member"));
    expect(original.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(original.headers.get("etag")).toBeNull();

    // First request generates the variant on demand; it is then served by the same static handler.
    const variant = await fetch(`${base}/uploads/shot-thumb.webp`, as("member"));
    expect(variant.status).toBe(200);
    expect(variant.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(await cacheControl("/uploads/shot-full.webp", as("member"))).toBe("private, max-age=31536000, immutable");
  });

  it("never caches the redirect to the original when a variant can't be generated", async () => {
    const res = await fetch(`${base}/uploads/broken-thumb.webp`, { ...as("member"), redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does not mark a 404 immutable", async () => {
    const res = await fetch(`${base}/uploads/nothing.png`, as("member"));
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
