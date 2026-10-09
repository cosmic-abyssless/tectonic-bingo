// Where a screenshot gets read is decided by OCR_URL: the separate service when it is set, this process when it isn't.
// A service that is set but down must not quietly move the work into the API process.

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./db/schema";
import { createOcrApp } from "./ocrApp";
import { createTestDb } from "./testUtils/testDb";

const engine = vi.hoisted(() => ({ recognizeLocally: vi.fn(), warmOcrEngine: vi.fn() }));
vi.mock("./ocrEngine", () => engine);
// log.error reports to Sentry through the SDK, loaded on demand (log.ts).
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/node", () => sentry);

import { analyzeSubmissionScreenshot, warmOcr } from "./ocr";

type Bingo = typeof schema.bingos.$inferSelect;
type Team = typeof schema.teams.$inferSelect;

const bingo = { id: "bingo-1" } as Bingo;
const team = { id: "team-1", codeword: "pikachu" } as Team;
let server: Server | undefined;
const remoteReads = vi.fn();

function serve(port = 0): Promise<string> {
  const app = createOcrApp({ recognize: async (image, priority) => (remoteReads(image, priority), ["remote pikachu"]), isReady: () => true, maxBytes: 1024 });
  return new Promise((resolve) => {
    server = app.listen(port, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
}

async function stopService(): Promise<void> {
  const running = server;
  server = undefined;
  // fetch keeps connections alive, and close() would wait for them to go idle.
  running?.closeAllConnections();
  await new Promise<void>((resolve) => (running ? running.close(() => resolve()) : resolve()));
}

beforeEach(() => {
  vi.stubEnv("OCR_URL", "");
  vi.stubEnv("GOOGLE_VISION_API_KEY", "");
  engine.recognizeLocally.mockReset().mockResolvedValue(["local pikachu"]);
  engine.warmOcrEngine.mockReset().mockResolvedValue(undefined);
  remoteReads.mockReset();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await stopService();
});

// A distinct image per test: readings are cached by the image's bytes.
const shot = (name: string) => ({ buffer: Buffer.from(`screenshot ${name}`), mimetype: "image/png" });

describe("analysing a screenshot", () => {
  it("reads it in-process when OCR_URL is unset (local development, tests)", async () => {
    const { db } = createTestDb();
    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("in-process"));

    expect(engine.recognizeLocally).toHaveBeenCalledTimes(1);
    expect(result.extractedText).toEqual(["local pikachu"]);
    expect(result.codewordFound).toBe(true);
  });

  it("sends it to the OCR service when OCR_URL is set, and never loads the engine", async () => {
    vi.stubEnv("OCR_URL", await serve());
    const { db } = createTestDb();

    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("remote"), { priority: "background" });

    expect(result.extractedText).toEqual(["remote pikachu"]);
    expect(result.codewordFound).toBe(true);
    expect(remoteReads).toHaveBeenCalledWith(expect.any(Buffer), "background");
    expect(engine.recognizeLocally).not.toHaveBeenCalled();
  });

  it("reads a screenshot once even though the modal and the submission both analyse it", async () => {
    vi.stubEnv("OCR_URL", await serve());
    const { db } = createTestDb();
    const file = shot("cached");

    await analyzeSubmissionScreenshot(db, bingo, team, file);
    await analyzeSubmissionScreenshot(db, bingo, team, file, { priority: "background" });

    expect(remoteReads).toHaveBeenCalledTimes(1);
  });

  it("fails with a 503 when the service is set but down, without reading in-process", async () => {
    const url = await serve();
    await stopService();
    vi.stubEnv("OCR_URL", url);
    const { db } = createTestDb();

    const error = await analyzeSubmissionScreenshot(db, bingo, team, shot("down")).catch((e) => e);

    expect(error.status).toBe(503);
    expect(engine.recognizeLocally).not.toHaveBeenCalled();
  });

  it("logs an outage as a warning, not an error, so it isn't reported to Sentry on top of the route's own response", async () => {
    const url = await serve();
    await stopService();
    vi.stubEnv("OCR_URL", url);
    const { db } = createTestDb();
    const written = () => (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));

    await analyzeSubmissionScreenshot(db, bingo, team, shot("quiet outage")).catch(() => undefined);

    const levels = written().map((line) => (JSON.parse(line) as { level: string }).level);
    expect(levels).toContain("warn");
    expect(levels).not.toContain("error");
  });

  it("recovers by itself once the service is back", async () => {
    const url = await serve();
    await stopService();
    vi.stubEnv("OCR_URL", url);
    const { db } = createTestDb();
    const file = shot("recovers");

    await expect(analyzeSubmissionScreenshot(db, bingo, team, file)).rejects.toMatchObject({ status: 503 });

    await serve(Number(new URL(url).port));
    const result = await analyzeSubmissionScreenshot(db, bingo, team, file);
    expect(result.codewordFound).toBe(true);
  });
});

// With GOOGLE_VISION_API_KEY set, Cloud Vision reads first and the local engine (in-process or the OCR service) is the
// fallback. Calls to Cloud Vision are answered here; any other request (the OCR service) goes out as usual.
describe("analysing a screenshot with Cloud Vision", () => {
  const realFetch = globalThis.fetch;
  const googleCalls = vi.fn();
  function googleAnswers(status: number, body: unknown) {
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).startsWith("https://vision.googleapis.com/")) return realFetch(url, init);
      googleCalls(url, init);
      return new Response(JSON.stringify(body), { status });
    });
  }
  const levels = () => (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => (JSON.parse(String(call[0])) as { level: string }).level);

  // An outage makes Cloud Vision sit out a minute (withFallback); each test starts an hour after the last, so none
  // inherits another's.
  let hour = 0;
  beforeEach(() => {
    vi.stubEnv("GOOGLE_VISION_API_KEY", "test-key");
    googleCalls.mockReset();
    sentry.captureException.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2030, 0, 1) + ++hour * 3_600_000));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads it with Cloud Vision, and never touches the local engine", async () => {
    googleAnswers(200, { responses: [{ fullTextAnnotation: { text: "google pikachu" } }] });
    const { db } = createTestDb();

    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("google"));

    expect(result.extractedText).toEqual(["google pikachu"]);
    expect(result.codewordFound).toBe(true);
    expect(googleCalls).toHaveBeenCalledTimes(1);
    expect(engine.recognizeLocally).not.toHaveBeenCalled();
  });

  it("falls back to the local engine in-process when Cloud Vision is down, as a warning", async () => {
    googleAnswers(503, { error: { message: "unavailable" } });
    const { db } = createTestDb();

    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("google down"));

    expect(result.extractedText).toEqual(["local pikachu"]);
    expect(engine.recognizeLocally).toHaveBeenCalledTimes(1);
    expect(levels()).not.toContain("error");
  });

  it("falls back to the OCR service when there is one", async () => {
    googleAnswers(503, { error: { message: "unavailable" } });
    vi.stubEnv("OCR_URL", await serve());
    const { db } = createTestDb();

    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("google down, service up"), { priority: "background" });

    expect(result.extractedText).toEqual(["remote pikachu"]);
    expect(remoteReads).toHaveBeenCalledWith(expect.any(Buffer), "background");
    expect(engine.recognizeLocally).not.toHaveBeenCalled();
  });

  it("still reads the screenshot when the key is refused, and reports the key to Sentry", async () => {
    googleAnswers(403, { error: { status: "PERMISSION_DENIED" } });
    const { db } = createTestDb();

    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("bad key"));

    expect(result.extractedText).toEqual(["local pikachu"]);
    expect(levels()).toContain("error");
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ name: "OcrUnavailableError", needsAttention: true }), expect.anything()));
  });

  it("during an outage, reads the next screenshots with the local engine without asking Cloud Vision again", async () => {
    googleAnswers(503, { error: { message: "unavailable" } });
    const { db } = createTestDb();

    await analyzeSubmissionScreenshot(db, bingo, team, shot("outage 1"));
    await analyzeSubmissionScreenshot(db, bingo, team, shot("outage 2"));

    expect(googleCalls).toHaveBeenCalledTimes(1);
    expect(engine.recognizeLocally).toHaveBeenCalledTimes(2);
  });

  it("falls back for an image Cloud Vision won't take, which the local engine may still read", async () => {
    googleAnswers(200, { responses: [{ error: { code: 3, message: "Bad image data." } }] });
    const { db } = createTestDb();

    expect((await analyzeSubmissionScreenshot(db, bingo, team, shot("refused image"))).extractedText).toEqual(["local pikachu"]);
  });

  it("reads a screenshot once even though the modal and the submission both analyse it", async () => {
    googleAnswers(200, { responses: [{ fullTextAnnotation: { text: "google pikachu" } }] });
    const { db } = createTestDb();
    const file = shot("google cached");

    await analyzeSubmissionScreenshot(db, bingo, team, file);
    await analyzeSubmissionScreenshot(db, bingo, team, file, { priority: "background" });

    expect(googleCalls).toHaveBeenCalledTimes(1);
  });
});

describe("warmOcr", () => {
  it("loads the engine in-process when there is no OCR service", async () => {
    await warmOcr();
    expect(engine.warmOcrEngine).toHaveBeenCalledTimes(1);
  });

  it("leaves the model to the OCR service when there is one", async () => {
    vi.stubEnv("OCR_URL", "http://ocr:8080");
    await warmOcr();
    expect(engine.warmOcrEngine).not.toHaveBeenCalled();
  });
});
