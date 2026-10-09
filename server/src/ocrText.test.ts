import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { createTextReader, withFallback } from "./ocrText";

// log.error reports to Sentry through the SDK, loaded on demand (log.ts).
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/node", () => sentry);

const image = (text: string) => Buffer.from(text);

describe("createTextReader", () => {
  it("reads an image once and serves the same bytes from the cache afterwards", async () => {
    const recognize = vi.fn(async () => ["line one", "line two"]);
    const read = createTextReader(recognize);

    expect(await read(image("a"), "interactive")).toEqual(["line one", "line two"]);
    // The submission modal's analysis and the submission's own analysis send identical bytes.
    expect(await read(image("a"), "background")).toEqual(["line one", "line two"]);
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it("reads different images separately", async () => {
    const recognize = vi.fn(async (buf: Buffer) => [buf.toString()]);
    const read = createTextReader(recognize);

    expect(await read(image("a"), "interactive")).toEqual(["a"]);
    expect(await read(image("b"), "interactive")).toEqual(["b"]);
    expect(recognize).toHaveBeenCalledTimes(2);
  });

  it("shares one reading between simultaneous requests for the same image", async () => {
    let finish!: (lines: string[]) => void;
    const recognize = vi.fn(() => new Promise<string[]>((resolve) => (finish = resolve)));
    const read = createTextReader(recognize);

    const first = read(image("a"), "interactive");
    const second = read(image("a"), "background");
    await vi.waitFor(() => expect(recognize).toHaveBeenCalled());
    finish(["shared"]);

    expect(await first).toEqual(["shared"]);
    expect(await second).toEqual(["shared"]);
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure, so the next request tries again", async () => {
    const recognize = vi.fn().mockRejectedValueOnce(new Error("ocr down")).mockResolvedValueOnce(["back up"]);
    const read = createTextReader(recognize);

    await expect(read(image("a"), "interactive")).rejects.toThrow("ocr down");
    expect(await read(image("a"), "interactive")).toEqual(["back up"]);
    expect(recognize).toHaveBeenCalledTimes(2);
  });
});

describe("withFallback", () => {
  const names = { primary: "Cloud Vision", fallback: "the local engine" };
  const written = () => (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => JSON.parse(String(call[0])) as { level: string; msg: string; err?: { message: string } });
  let clock = 0;
  const now = () => clock;
  const fallback = vi.fn(async () => ["from the fallback"]);

  beforeEach(() => {
    clock = 1_000_000;
    fallback.mockClear();
    sentry.captureException.mockClear();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads with the primary while it works", async () => {
    const read = withFallback(async () => ["from the primary"], fallback, names, { cooldownMs: 60_000, now });
    expect(await read(image("a"), "interactive")).toEqual(["from the primary"]);
    expect(fallback).not.toHaveBeenCalled();
  });

  // A dead key degrades every reading to the fallback, so it has to reach Sentry rather than only the logs.
  it("reads with the fallback when the key is refused, and reports that to Sentry, once per failure", async () => {
    const refused = new OcrUnavailableError("Cloud Vision answered 403", { needsAttention: true, detail: "PERMISSION_DENIED" });
    const read = withFallback(async () => { throw refused; }, fallback, names, { cooldownMs: 60_000, now });

    expect(await read(image("a"), "interactive")).toEqual(["from the fallback"]);

    expect(written()).toEqual([expect.objectContaining({ level: "error", err: expect.objectContaining({ message: refused.message }) })]);
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledWith(refused, expect.anything()));
  });

  it("reads an image the primary refused with the fallback, as a warning", async () => {
    const read = withFallback(async () => { throw new OcrImageError(); }, fallback, names, { cooldownMs: 60_000, now });
    expect(await read(image("a"), "interactive")).toEqual(["from the fallback"]);
    expect(written().map((l) => l.level)).toEqual(["warn"]);
  });

  it("reports anything a reader doesn't mean to throw as a bug", async () => {
    const read = withFallback(async () => { throw new TypeError("oops"); }, fallback, names, { cooldownMs: 60_000, now });
    expect(await read(image("a"), "interactive")).toEqual(["from the fallback"]);
    expect(written().map((l) => l.level)).toEqual(["error"]);
  });

  // During an outage each screenshot would otherwise wait out the primary's timeout before the fallback even starts.
  it("after a transient failure, skips the primary for the cooldown, says so once, and says when it's back", async () => {
    const primary = vi.fn(async (): Promise<string[]> => { throw new OcrUnavailableError("Cloud Vision gave no answer within 8000 ms", { transient: true }); });
    const read = withFallback(primary, fallback, names, { cooldownMs: 60_000, now });

    await read(image("a"), "interactive");
    clock += 30_000;
    await read(image("b"), "interactive");
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);

    // The cooldown over, it's tried again; still down, the cooldown starts over without another log line.
    clock += 31_000;
    await read(image("c"), "interactive");
    expect(primary).toHaveBeenCalledTimes(2);
    expect(written().map((l) => l.level)).toEqual(["warn"]);

    clock += 61_000;
    primary.mockResolvedValueOnce(["from the primary"]);
    expect(await read(image("d"), "interactive")).toEqual(["from the primary"]);
    expect(written().map((l) => l.msg)).toEqual(["Cloud Vision failed, so the local engine reads screenshots for the next 60 s", "Cloud Vision reads screenshots again"]);
  });
});
