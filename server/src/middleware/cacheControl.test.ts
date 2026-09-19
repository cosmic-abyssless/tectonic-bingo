import { afterAll, beforeAll, describe, expect, it } from "vitest";
import compression from "compression";
import express from "express";
import type { AddressInfo } from "net";
import http from "http";
import type { Server } from "http";
import { noStore, privateRevalidate } from "./cacheControl";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(compression());
  const big = { tiles: Array.from({ length: 400 }, (_, i) => ({ id: `tile-${i}`, name: "A tile with a fairly long name", points: i })) };
  app.get("/api/board", privateRevalidate, (_req, res) => res.json(big));
  app.get("/api/me", noStore, (_req, res) => res.status(401).json({ error: "Not authenticated" }));
  app.get("/api/plain", (_req, res) => res.json(big));
  app.get("/image.webp", (_req, res) => {
    res.type("image/webp").send(Buffer.alloc(20_000, 1));
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe("privateRevalidate", () => {
  it("marks the response private and always-revalidate, never max-age or public", async () => {
    const res = await fetch(`${base}/api/board`);
    const cc = res.headers.get("cache-control");
    expect(cc).toBe("private, no-cache");
    expect(cc).not.toContain("max-age");
    expect(cc).not.toContain("public");
  });

  it("leaves other routes without a Cache-Control header", async () => {
    expect((await fetch(`${base}/api/plain`)).headers.get("cache-control")).toBeNull();
  });

  it("still gets a conditional 304 from Express's ETag", async () => {
    const first = await fetch(`${base}/api/board`);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    // Plain http: fetch() adds `Cache-Control: no-cache` to requests carrying
    // If-None-Match, which makes Express treat them as unconditional; a browser's
    // revalidation doesn't.
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`${base}/api/board`, { headers: { "If-None-Match": etag! } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on("error", reject);
    });
    expect(status).toBe(304);
  });
});

describe("compression", () => {
  it("gzips large JSON and makes it much smaller", async () => {
    const res = await fetch(`${base}/api/board`, { headers: { "Accept-Encoding": "gzip" } });
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const decoded = (await res.arrayBuffer()).byteLength;
    const raw = JSON.stringify({ tiles: Array.from({ length: 400 }, (_, i) => ({ id: `tile-${i}`, name: "A tile with a fairly long name", points: i })) }).length;
    expect(decoded).toBe(raw);
  });

  it("leaves images uncompressed", async () => {
    const res = await fetch(`${base}/image.webp`, { headers: { "Accept-Encoding": "gzip" } });
    expect(res.headers.get("content-encoding")).toBeNull();
  });
});

describe("noStore", () => {
  it("forbids storing the response anywhere, on errors too", async () => {
    const res = await fetch(`${base}/api/me`);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
