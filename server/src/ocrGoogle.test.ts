import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { createGoogleVisionRecognizer } from "./ocrGoogle";

const written = () => (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => JSON.parse(String(call[0])) as { level: string; msg: string });

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function answering(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

describe("createGoogleVisionRecognizer", () => {
  it("sends the image, with the key in a header and never in the URL, and answers one entry per line read", async () => {
    const fetchImpl = answering(200, { responses: [{ fullTextAnnotation: { text: "Frost 05/03/2026 20:31 UTC\n  Valuable drop: Spirit shield  \n\n" } }] });
    const read = createGoogleVisionRecognizer({ apiKey: "the-key", timeoutMs: 1000, fetchImpl });

    expect(await read(Buffer.from("png bytes"))).toEqual(["Frost 05/03/2026 20:31 UTC", "Valuable drop: Spirit shield"]);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).not.toContain("the-key");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("the-key");
    expect(JSON.parse(String(init!.body))).toEqual({ requests: [{ image: { content: Buffer.from("png bytes").toString("base64") }, features: [{ type: "TEXT_DETECTION" }] }] });
  });

  it("answers an empty list for a screenshot with no text", async () => {
    const read = createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: answering(200, { responses: [{}] }) });
    expect(await read(Buffer.from("x"))).toEqual([]);
  });

  it("is unavailable when Cloud Vision can't be reached or doesn't answer in time", async () => {
    const timedOut = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 50, fetchImpl: timedOut })(Buffer.from("x"))).rejects.toThrow(/no answer within 50 ms/);
    const unreachable = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 50, fetchImpl: unreachable })(Buffer.from("x"))).rejects.toBeInstanceOf(OcrUnavailableError);
  });

  // A bad key or a switched-off API needs someone to fix the Google Cloud project; Google's own trouble passes.
  it("reports a refused key as an error, and Google's own trouble as a warning", async () => {
    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: answering(403, "PERMISSION_DENIED") })(Buffer.from("x"))).rejects.toBeInstanceOf(OcrUnavailableError);
    expect(written().at(-1)).toMatchObject({ level: "error", msg: "cloud vision refused the request" });

    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: answering(429, "RESOURCE_EXHAUSTED") })(Buffer.from("x"))).rejects.toBeInstanceOf(OcrUnavailableError);
    expect(written().at(-1)).toMatchObject({ level: "warn" });
  });

  it("refuses an image Cloud Vision can't read, and is unavailable on any other error", async () => {
    const badImage = answering(200, { responses: [{ error: { code: 3, message: "Bad image data." } }] });
    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: badImage })(Buffer.from("x"))).rejects.toBeInstanceOf(OcrImageError);

    const internal = answering(200, { responses: [{ error: { code: 13, message: "Internal error." } }] });
    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: internal })(Buffer.from("x"))).rejects.toBeInstanceOf(OcrUnavailableError);

    await expect(createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: answering(200, "<html>") })(Buffer.from("x"))).rejects.toBeInstanceOf(OcrUnavailableError);
  });
});
