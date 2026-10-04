import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import compression from "compression";
import crypto from "crypto";
import fs from "fs";
import http, { type IncomingHttpHeaders, type Server } from "http";
import os from "os";
import path from "path";
import zlib from "zlib";
import type { AddressInfo } from "net";
import { mountClientApp } from "./clientApp";
import { pickPrecompressedEncoding } from "./staticCaching";

let outer: string;
let server: Server;
let base: string;
let assets: string;
// Random text, so neither it nor its compressed copies fall under compression()'s 1 KB threshold: a response it leaves
// alone is left alone because it is already encoded, not because it is small.
const bundle = `console.log("${crypto.randomBytes(3000).toString("hex")}")`;
const styles = `.x{content:"${crypto.randomBytes(3000).toString("hex")}"}`;

beforeAll(async () => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), "client-app-"));
  const dist = path.join(outer, "dist");
  assets = path.join(dist, "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(dist, "index.html"), "<html><head><title>app</title></head><body>shell</body></html>");
  fs.writeFileSync(path.join(assets, "app-abc123.js"), "console.log(1)");
  fs.writeFileSync(path.join(dist, "favicon.svg"), "<svg/>");
  // What the build writes beside a hashed asset over 1 KB (client/vite.config.ts): Brotli and gzip copies.
  for (const [name, body] of [["main-def456.js", bundle], ["main-def456.css", styles]]) {
    fs.writeFileSync(path.join(assets, name), body);
    fs.writeFileSync(path.join(assets, `${name}.br`), zlib.brotliCompressSync(body));
    fs.writeFileSync(path.join(assets, `${name}.gz`), zlib.gzipSync(body));
  }
  // The build never writes this, but nothing may serve it if it were there.
  fs.writeFileSync(path.join(dist, "index.html.br"), "not the page");

  const app = express();
  // Ahead of everything, as in index.ts, so these tests show a precompressed copy is never encoded a second time.
  app.use(compression());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/thing", (_req, res) => res.json({ api: true }));
  expect(mountClientApp(app, dist, { sentryDsn: "https://k@x/1", environment: "staging", release: "abc1234" })).toBe(true);
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

const text = async (url: string) => (await fetch(`${base}${url}`)).text();

describe("mountClientApp", () => {
  it("injects the runtime config into the page itself, deep links, and /index.html", async () => {
    for (const url of ["/", "/index.html", "/b/some-bingo/mod"]) {
      const res = await fetch(`${base}${url}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      const body = await res.text();
      expect(body).toContain('window.__APP_CONFIG__={"sentryDsn":"https://k@x/1","environment":"staging","release":"abc1234"}');
      expect(body).toContain("shell");
    }
  });

  it("serves assets and other static files untouched", async () => {
    expect(await text("/assets/app-abc123.js")).toBe("console.log(1)");
    expect(await text("/favicon.svg")).toBe("<svg/>");
    expect((await fetch(`${base}/assets/app-abc123.js`)).headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("leaves routes registered earlier alone", async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    expect(await (await fetch(`${base}/api/thing`)).json()).toEqual({ api: true });
  });

  it("does not answer API-shaped paths that nothing handles with the app", async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("mounts nothing when there is no build", () => {
    const app = express();
    expect(mountClientApp(app, path.join(outer, "missing"), {})).toBe(false);
  });
});

// The bytes as they went over the wire: fetch would decode them, and send its own Accept-Encoding. The path goes out
// exactly as written (a URL would resolve a `..` in it first).
const raw = (url: string, headers: Record<string, string> = {}, method = "GET") =>
  new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http
      .request({ host: "127.0.0.1", port: (server.address() as AddressInfo).port, path: url, method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on("error", reject)
      .end();
  });

describe("precompressed assets", () => {
  it("sends the Brotli copy as it is to a client that takes Brotli", async () => {
    const res = await raw("/assets/main-def456.js", { "Accept-Encoding": "gzip, deflate, br" });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("br");
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.headers["vary"]).toBe("Accept-Encoding");
    // Byte for byte the build's copy: compression() didn't encode it again.
    expect(res.body.equals(fs.readFileSync(path.join(assets, "main-def456.js.br")))).toBe(true);
    expect(zlib.brotliDecompressSync(res.body).toString()).toBe(bundle);
  });

  it("gives a stylesheet its own Content-Type", async () => {
    const res = await raw("/assets/main-def456.css", { "Accept-Encoding": "br" });
    expect(res.headers["content-encoding"]).toBe("br");
    expect(res.headers["content-type"]).toMatch(/^text\/css/);
  });

  it("sends the gzip copy to a client that takes gzip but not Brotli", async () => {
    const res = await raw("/assets/main-def456.js", { "Accept-Encoding": "gzip, deflate" });
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["vary"]).toBe("Accept-Encoding");
    expect(res.body.equals(fs.readFileSync(path.join(assets, "main-def456.js.gz")))).toBe(true);
  });

  it("treats q=0 as a refusal", async () => {
    expect((await raw("/assets/main-def456.js", { "Accept-Encoding": "br;q=0, gzip" })).headers["content-encoding"]).toBe("gzip");
    const neither = await raw("/assets/main-def456.js", { "Accept-Encoding": "br;q=0, gzip;q=0" });
    expect(neither.headers["content-encoding"]).toBeUndefined();
    expect(neither.body.toString()).toBe(bundle);
  });

  it("sends the plain file, still marked as varying, to a client that accepts no encoding", async () => {
    const res = await raw("/assets/main-def456.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.headers["vary"]).toBe("Accept-Encoding");
    expect(res.body.toString()).toBe(bundle);
  });

  it("answers HEAD and conditional requests for the encoded copy", async () => {
    const head = await raw("/assets/main-def456.js", { "Accept-Encoding": "br" }, "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers["content-encoding"]).toBe("br");
    expect(Number(head.headers["content-length"])).toBe(fs.statSync(path.join(assets, "main-def456.js.br")).size);
    expect(head.body.length).toBe(0);

    const again = await raw("/assets/main-def456.js", { "Accept-Encoding": "br", "If-None-Match": head.headers.etag! });
    expect(again.status).toBe(304);
  });

  it("never serves the page, or anything outside assets, from a compressed copy", async () => {
    for (const url of ["/", "/index.html", "/b/some-bingo"]) {
      const res = await raw(url, { "Accept-Encoding": "br, gzip" });
      expect(res.headers["content-encoding"]).toBeUndefined();
      expect(res.body.toString()).toContain("shell");
    }
    const escape = await raw("/assets/%2e%2e/index.html", { "Accept-Encoding": "br" });
    expect(escape.headers["content-encoding"]).toBeUndefined();
    expect(escape.body.toString()).not.toContain("not the page");
  });
});

describe("pickPrecompressedEncoding", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["identity", null],
    ["br", "br"],
    ["gzip, deflate, br", "br"],
    ["gzip, br", "br"],
    ["gzip, deflate", "gzip"],
    ["x-gzip", "gzip"],
    ["deflate", null],
    ["br;q=0, gzip", "gzip"],
    ["br; q=0.5, gzip; q=1", "gzip"],
    ["BR;Q=0.8, gzip;q=0.8", "br"],
    ["br;q=0, gzip;q=0", null],
    ["*", "br"],
    ["*;q=0.5, br;q=0", "gzip"],
    ["gzip, *;q=0", "gzip"],
    // A token that merely contains the letters is not Brotli.
    ["bro, gzip", "gzip"],
  ])("%j picks %j", (header, expected) => {
    expect(pickPrecompressedEncoding(header)).toBe(expected);
  });
});
