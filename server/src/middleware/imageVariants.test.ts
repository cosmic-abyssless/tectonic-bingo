import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import sharp from "sharp";
import { serveImageVariants } from "./imageVariants";
import { imageUpload } from "./upload";
import { THUMB_MAX_WIDTH, FULL_MAX_WIDTH } from "../services/imageService";

// sharp keeps decoded files open in its cache, which blocks deleting the temp dir on Windows.
sharp.cache(false);

let outer: string;
let root: string;
let server: Server;
let base: string;

async function png(file: string, width: number, height: number) {
  await sharp({ create: { width, height, channels: 3, background: "#22aa55" } }).png().toFile(file);
}

beforeAll(async () => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), "variants-"));
  root = path.join(outer, "uploads");
  fs.mkdirSync(path.join(root, "tiles"), { recursive: true });
  await png(path.join(root, "old-shot.png"), 2400, 1200);
  await png(path.join(root, "tiles", "art.png"), 800, 800);
  fs.writeFileSync(path.join(root, "broken.png"), "definitely not an image");
  fs.writeFileSync(path.join(root, "note.txt"), "plain file");
  // A real image one level above the uploads dir — must never be reachable.
  await png(path.join(outer, "secret.png"), 500, 500);

  const app = express();
  const uploadDir = path.join(root, "uploaded");
  const upload = imageUpload(uploadDir, { variants: true });
  app.post("/upload", upload.single("image"), (req, res) => res.json({ filename: req.file?.filename }));
  app.use("/uploads", serveImageVariants(root), express.static(root));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  // Windows can hold a file handle a moment after sharp/undici are done with it.
  fs.rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("serveImageVariants", () => {
  it("generates a missing variant on first request, then serves it as WebP", async () => {
    expect(fs.existsSync(path.join(root, "old-shot-thumb.webp"))).toBe(false);
    const res = await fetch(`${base}/uploads/old-shot-thumb.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(THUMB_MAX_WIDTH);
    expect(fs.existsSync(path.join(root, "old-shot-full.webp"))).toBe(true);

    const full = await fetch(`${base}/uploads/old-shot-full.webp`);
    expect((await sharp(Buffer.from(await full.arrayBuffer())).metadata()).width).toBe(FULL_MAX_WIDTH);
  });

  it("works in subdirectories and answers concurrent first requests", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => fetch(`${base}/uploads/tiles/art-thumb.webp`)));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    // 800px original is under the full cap, so it isn't enlarged.
    const full = await fetch(`${base}/uploads/tiles/art-full.webp`);
    expect((await sharp(Buffer.from(await full.arrayBuffer())).metadata()).width).toBe(800);
  });

  it("leaves the original untouched and still served", async () => {
    const res = await fetch(`${base}/uploads/old-shot.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(2400);
  });

  it("redirects to the original when a variant can't be generated", async () => {
    const res = await fetch(`${base}/uploads/broken-thumb.webp`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/uploads/broken.png");
  });

  it("404s when there is no original, and never escapes the uploads directory", async () => {
    expect((await fetch(`${base}/uploads/nothing-thumb.webp`)).status).toBe(404);
    expect((await fetch(`${base}/uploads/..%2Fsecret-thumb.webp`)).status).toBe(404);
    expect((await fetch(`${base}/uploads/%2e%2e/secret-thumb.webp`)).status).toBe(404);
    expect(fs.existsSync(path.join(outer, "secret-thumb.webp"))).toBe(false);
  });

  it("ignores non-variant requests", async () => {
    expect((await fetch(`${base}/uploads/note.txt`)).status).toBe(200);
    expect((await fetch(`${base}/uploads/missing.png`)).status).toBe(404);
  });
});

describe("imageUpload with variants", () => {
  it("writes WebP thumb + full variants beside the saved original", async () => {
    const form = new FormData();
    const bytes = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#aa2255" } }).png().toBuffer();
    form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "shot.png");
    const res = await fetch(`${base}/upload`, { method: "POST", body: form });
    const { filename } = (await res.json()) as { filename: string };
    expect(filename).toMatch(/\.png$/);

    const stem = filename.replace(/\.png$/, "");
    const dir = path.join(root, "uploaded");
    // Generation is fire-and-forget after the response; wait for it to land.
    for (let i = 0; i < 50 && !fs.existsSync(path.join(dir, `${stem}-full.webp`)); i++) await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(path.join(dir, filename))).toBe(true);
    expect((await sharp(path.join(dir, `${stem}-thumb.webp`)).metadata()).width).toBe(THUMB_MAX_WIDTH);
    expect((await sharp(path.join(dir, `${stem}-full.webp`)).metadata()).format).toBe("webp");
  });
});
