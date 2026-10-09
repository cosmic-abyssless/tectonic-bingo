// Reads the same real screenshots with the local engine (PP-OCRv6 small, the production options in src/ocrEngine.ts)
// and with hosted OCR APIs, and reports what each one costs in time and whether it still finds what the matcher
// needs: the Team's Codeword and the drop's item name, judged with the exact matcher production uses
// (textMatchService: one edit for the Codeword, length-scaled tolerance for an item). Issue #485 has the local
// engine's own tuning; this answers whether a hosted API is faster without losing the drop line.
//
// Not part of the server build (tsconfig.json's rootDir is src/); run with tsx:
//
//   node ../node_modules/tsx/dist/cli.mjs scripts/ocr-compare.ts --dir <screenshots> [options]
//
//   --dir <path>          where the screenshots are (the site's uploads directory, or a folder of downloads)
//   --set <path>          the set to read: JSON {images: [{file, codeword, terms, ...}]} (default: ocr-compare-set.json)
//   --engines a,b,c       local, google, azure (default: every engine that has its credentials)
//   --runs <n>            times to read each image per engine; the fastest counts (default 1)
//   --json <path>         also write every reading's text and timing here, for looking at the misses
//   --fetch-from <url>    first download the set's files from <url>/uploads/<file> into --dir. Uploads need a
//                         logged-in clan member: pass that browser session's cookie header in TB_COOKIE.
//
// Credentials, from the environment:
//   GOOGLE_VISION_API_KEY                 Cloud Vision, TEXT_DETECTION (https://cloud.google.com/vision/docs/ocr)
//   AZURE_VISION_ENDPOINT, AZURE_VISION_KEY   Azure AI Vision Image Analysis 4.0, the `read` feature
//                                         (endpoint like https://<resource>.cognitiveservices.azure.com)
//
// The local engine downloads its model on first use (~30 MB, cached in ~/.cache/ppu-paddle-ocr); the first reading
// is run once untimed so the model load never counts against it, as warmOcr() ensures in production.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGoogleVisionRecognizer } from "../src/ocrGoogle";
import { fuzzyIncludes } from "../src/services/textMatchService";

interface SetImage {
  file: string;
  codeword: string;
  terms: string[];
  kind?: string;
  note?: string;
}

interface Reading {
  engine: string;
  file: string;
  ms: number;
  lines: string[];
  codewordFound: boolean;
  /** Each expected term, and whether the matcher would have found it. */
  terms: { term: string; found: boolean }[];
  error?: string;
}

type Engine = { name: string; read: (image: Buffer, mimetype: string) => Promise<string[]>; warm?: () => Promise<void> };

/** The value after `--name`; none when the flag is missing or followed straight by another flag (`--json --runs 3`). */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function mimetypeOf(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
}

// ---- engines --------------------------------------------------------------------------------------------------------

function localEngine(): Engine {
  // Imported lazily so the hosted engines can run on a machine without the ONNX runtime installed.
  type OcrEngineModule = typeof import("../src/ocrEngine");
  let mod: Promise<OcrEngineModule> | undefined;
  const load = () => (mod ??= import("../src/ocrEngine"));
  return {
    name: "local",
    warm: async () => {
      const { warmOcrEngine } = await load();
      if (!(await warmOcrEngine())) throw new Error("the local OCR model failed to load");
    },
    read: async (image) => (await load()).recognizeLocally(image, "interactive"),
  };
}

function googleEngine(apiKey: string): Engine {
  // Production's own reader (src/ocrGoogle.ts), so the comparison measures what the site runs.
  const read = createGoogleVisionRecognizer({ apiKey, timeoutMs: 30_000 });
  return { name: "google", read: (image) => read(image) };
}

function azureEngine(endpoint: string, key: string): Engine {
  const base = endpoint.replace(/\/+$/, "");
  return {
    name: "azure",
    read: async (image, mimetype) => {
      const res = await fetch(`${base}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/octet-stream", Accept: "application/json" },
        body: new Uint8Array(image),
      });
      if (!res.ok) throw new Error(`Azure Vision ${res.status} (${mimetype}): ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { readResult?: { blocks?: { lines?: { text?: string }[] }[] } };
      return (body.readResult?.blocks ?? []).flatMap((block) => (block.lines ?? []).map((line) => (line.text ?? "").trim())).filter(Boolean);
    },
  };
}

function availableEngines(): Engine[] {
  const wanted = arg("engines")?.split(",").map((s) => s.trim().toLowerCase());
  const engines: Engine[] = [];
  const want = (name: string) => !wanted || wanted.includes(name);

  if (want("local")) engines.push(localEngine());

  const googleKey = process.env.GOOGLE_VISION_API_KEY;
  if (want("google")) {
    if (googleKey) engines.push(googleEngine(googleKey));
    else if (wanted) throw new Error("google: set GOOGLE_VISION_API_KEY");
    else console.error("skipping google: GOOGLE_VISION_API_KEY is not set");
  }

  const azureEndpoint = process.env.AZURE_VISION_ENDPOINT;
  const azureKey = process.env.AZURE_VISION_KEY;
  if (want("azure")) {
    if (azureEndpoint && azureKey) engines.push(azureEngine(azureEndpoint, azureKey));
    else if (wanted) throw new Error("azure: set AZURE_VISION_ENDPOINT and AZURE_VISION_KEY");
    else console.error("skipping azure: AZURE_VISION_ENDPOINT and AZURE_VISION_KEY are not set");
  }

  if (wanted) for (const name of wanted) if (!["local", "google", "azure"].includes(name)) throw new Error(`unknown engine "${name}"`);
  return engines;
}

// ---- the set --------------------------------------------------------------------------------------------------------

async function fetchSet(images: SetImage[], from: string, dir: string): Promise<void> {
  const cookie = process.env.TB_COOKIE;
  if (!cookie) throw new Error("--fetch-from needs TB_COOKIE: the cookie header of a logged-in clan member's browser session");
  mkdirSync(dir, { recursive: true });
  const base = from.replace(/\/+$/, "");
  for (const image of images) {
    const target = path.join(dir, image.file);
    if (existsSync(target)) continue;
    const res = await fetch(`${base}/uploads/${image.file}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`GET ${base}/uploads/${image.file}: ${res.status}`);
    // An expired cookie is redirected to the login page, which fetch follows to a 200: saved as the screenshot, it would
    // be skipped by every later run (existsSync above) and read as an error forever.
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`GET ${base}/uploads/${image.file}: got ${type || "no content type"}, not an image (is TB_COOKIE still logged in?)`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    console.error(`fetched ${image.file}`);
  }
}

// ---- measuring ------------------------------------------------------------------------------------------------------

function judge(lines: string[], image: SetImage): Pick<Reading, "codewordFound" | "terms"> {
  return {
    // The same tolerances as runAnalyze in src/ocr.ts: one edit for the Codeword, the item default for terms.
    codewordFound: fuzzyIncludes(lines, image.codeword, { maxEdits: 1 }),
    terms: image.terms.map((term) => ({ term, found: fuzzyIncludes(lines, term) })),
  };
}

async function readImage(engine: Engine, image: SetImage, buffer: Buffer, runs: number): Promise<Reading> {
  // The fastest run that worked counts; a run that failed (a 429, a timeout) only counts when none worked, so one
  // hiccup doesn't count a screenshot an engine read fine as an error.
  let best: { ms: number; lines: string[] } | undefined;
  let failure: unknown;
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    try {
      const lines = await engine.read(buffer, mimetypeOf(image.file));
      const ms = performance.now() - started;
      if (!best || ms < best.ms) best = { ms, lines };
    } catch (err) {
      failure = err;
    }
  }
  if (!best) {
    return { engine: engine.name, file: image.file, ms: NaN, lines: [], codewordFound: false, terms: image.terms.map((term) => ({ term, found: false })), error: String(failure instanceof Error ? failure.message : failure) };
  }
  const { ms, lines } = best;
  return { engine: engine.name, file: image.file, ms, lines, ...judge(lines, image) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function fmtMs(ms: number): string {
  return Number.isFinite(ms) ? `${Math.round(ms)}` : "-";
}

function summarize(readings: Reading[], engines: Engine[], images: SetImage[]): string {
  const out: string[] = [];
  const termCount = images.reduce((n, image) => n + image.terms.length, 0);

  out.push(`| Engine | Codeword found | Terms found | Median ms | Mean ms | Max ms | Errors |`);
  out.push(`|---|---|---|---|---|---|---|`);
  for (const engine of engines) {
    const rows = readings.filter((r) => r.engine === engine.name);
    const ok = rows.filter((r) => !r.error);
    const times = ok.map((r) => r.ms);
    const codewords = ok.filter((r) => r.codewordFound).length;
    const terms = ok.reduce((n, r) => n + r.terms.filter((t) => t.found).length, 0);
    const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : NaN;
    out.push(`| ${engine.name} | ${codewords} / ${images.length} | ${terms} / ${termCount} | ${fmtMs(times.length ? median(times) : NaN)} | ${fmtMs(mean)} | ${fmtMs(times.length ? Math.max(...times) : NaN)} | ${rows.length - ok.length} |`);
  }

  out.push("");
  out.push(`| Screenshot | Expected | ${engines.map((e) => e.name).join(" | ")} |`);
  out.push(`|---|---|${engines.map(() => "---").join("|")}|`);
  for (const image of images) {
    const expected = [image.codeword, ...image.terms].join(", ");
    const cells = engines.map((engine) => {
      const r = readings.find((x) => x.engine === engine.name && x.file === image.file);
      if (!r) return "-";
      if (r.error) return `error`;
      const marks = [r.codewordFound ? "codeword ✓" : "codeword ✗", ...r.terms.map((t) => (t.found ? `${t.term} ✓` : `${t.term} ✗`))];
      return `${fmtMs(r.ms)} ms, ${r.lines.length} lines; ${marks.join(", ")}`;
    });
    out.push(`| ${image.file.slice(0, 8)} (${image.kind ?? "drop"}) | ${expected} | ${cells.join(" | ")} |`);
  }

  const errors = readings.filter((r) => r.error);
  if (errors.length) {
    out.push("");
    for (const r of errors) out.push(`${r.engine} ${r.file}: ${r.error}`);
  }
  return out.join("\n");
}

async function main() {
  const dir = arg("dir");
  if (!dir) {
    console.error("Usage: tsx scripts/ocr-compare.ts --dir <screenshots> [--set <json>] [--engines local,google,azure] [--runs n] [--json out.json] [--fetch-from https://tectonic.bingo]");
    process.exit(1);
  }
  const setPath = arg("set") ?? path.join(__dirname, "ocr-compare-set.json");
  const { images } = JSON.parse(readFileSync(setPath, "utf8")) as { images: SetImage[] };
  const runs = Math.max(1, Number.parseInt(arg("runs") ?? "1", 10) || 1);

  const from = arg("fetch-from");
  if (from) await fetchSet(images, from, dir);

  const missing = images.filter((image) => !existsSync(path.join(dir, image.file)));
  if (missing.length) {
    console.error(`${missing.length} of the set's files are not in ${dir}:\n  ${missing.map((m) => m.file).join("\n  ")}`);
    process.exit(1);
  }

  const engines = availableEngines();
  if (!engines.length) {
    console.error("no engine to run: see --engines and the credentials at the top of this file");
    process.exit(1);
  }

  const buffers = new Map(images.map((image) => [image.file, readFileSync(path.join(dir, image.file))]));
  const readings: Reading[] = [];
  for (const engine of engines) {
    if (engine.warm) {
      const started = performance.now();
      await engine.warm();
      console.error(`${engine.name}: ready in ${Math.round(performance.now() - started)} ms`);
    }
    // One untimed reading so a cold connection or lazily loaded session never counts against the first image.
    await engine.read(buffers.get(images[0]!.file)!, mimetypeOf(images[0]!.file)).catch(() => undefined);
    for (const image of images) {
      const reading = await readImage(engine, image, buffers.get(image.file)!, runs);
      readings.push(reading);
      console.error(`${engine.name} ${image.file}: ${reading.error ? `error: ${reading.error}` : `${fmtMs(reading.ms)} ms, ${reading.lines.length} lines`}`);
    }
  }

  const report = summarize(readings, engines, images);
  console.log(report);

  const jsonPath = arg("json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ set: setPath, runs, readings }, null, 2));
    console.error(`wrote ${jsonPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
