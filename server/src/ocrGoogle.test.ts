import { describe, expect, it, vi } from "vitest";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { createGoogleVisionRecognizer } from "./ocrGoogle";

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
    expect(JSON.parse(String(init!.body))).toEqual({
      requests: [{ image: { content: Buffer.from("png bytes").toString("base64") }, features: [{ type: "TEXT_DETECTION" }], imageContext: { languageHints: ["en"] } }],
    });
  });

  it("answers an empty list for a screenshot with no text", async () => {
    const read = createGoogleVisionRecognizer({ apiKey: "k", timeoutMs: 1000, fetchImpl: answering(200, { responses: [{}] }) });
    expect(await read(Buffer.from("x"))).toEqual([]);
  });

  const failure = (fetchImpl: ReturnType<typeof vi.fn>, timeoutMs = 1000) => createGoogleVisionRecognizer({ apiKey: "k", timeoutMs, fetchImpl: fetchImpl as typeof fetch })(Buffer.from("x")).catch((e: unknown) => e);

  it("is unavailable for a while when Cloud Vision can't be reached or doesn't answer in time", async () => {
    const timedOut = await failure(vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }), 50);
    expect(timedOut).toBeInstanceOf(OcrUnavailableError);
    expect(timedOut).toMatchObject({ message: expect.stringMatching(/no answer within 50 ms/), transient: true, needsAttention: false });
    expect(await failure(vi.fn(async () => { throw new TypeError("fetch failed"); }))).toMatchObject({ transient: true });
  });

  // A bad key or a switched-off API needs someone to fix the Google Cloud project; Google's own trouble passes.
  it("asks for a person when the key is refused, and not for Google's own trouble", async () => {
    expect(await failure(answering(403, "PERMISSION_DENIED"))).toMatchObject({ needsAttention: true, transient: false, detail: "PERMISSION_DENIED" });
    expect(await failure(answering(400, '{"error":{"message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}'))).toMatchObject({ needsAttention: true });
    // Any other 400 is about the one request, not the key.
    expect(await failure(answering(400, '{"error":{"message":"Request payload size exceeds the limit"}}'))).toMatchObject({ needsAttention: false, transient: false });
    expect(await failure(answering(413, "too large"))).toMatchObject({ needsAttention: false, transient: false });
    // Something answering in Google's place (a proxy, a retired endpoint) won't fix itself.
    for (const status of [404, 405, 410]) expect(await failure(answering(status, "not here"))).toMatchObject({ needsAttention: true, transient: false });
    expect(await failure(answering(429, "RESOURCE_EXHAUSTED"))).toMatchObject({ needsAttention: false, transient: true });
    expect(await failure(answering(503, "unavailable"))).toMatchObject({ needsAttention: false, transient: true });
  });

  it("refuses an image Cloud Vision can't read, and is unavailable on any other error", async () => {
    expect(await failure(answering(200, { responses: [{ error: { code: 3, message: "Bad image data." } }] }))).toBeInstanceOf(OcrImageError);
    // An error for one image falls back on its own, without the cooldown that takes Cloud Vision away from everyone.
    expect(await failure(answering(200, { responses: [{ error: { code: 13, message: "Internal error." } }] }))).toMatchObject({ name: "OcrUnavailableError", transient: false, needsAttention: false });
    expect(await failure(answering(200, { responses: [{ error: { code: 4, message: "Deadline exceeded." } }] }))).toMatchObject({ transient: false, needsAttention: false });
    // The codes inside a 200 that mirror Google's trouble (RESOURCE_EXHAUSTED, UNAVAILABLE) and a refused key
    // (PERMISSION_DENIED, UNAUTHENTICATED).
    for (const code of [8, 14]) expect(await failure(answering(200, { responses: [{ error: { code, message: "x" } }] }))).toMatchObject({ transient: true, needsAttention: false });
    for (const code of [7, 16]) expect(await failure(answering(200, { responses: [{ error: { code, message: "x" } }] }))).toMatchObject({ transient: false, needsAttention: true });
    expect(await failure(answering(200, "<html>"))).toBeInstanceOf(OcrUnavailableError);
  });

  // Only a real reading may be cached as "no text": a proxy's page or a change on Google's side must fall back instead.
  it("is unavailable for an answer in the wrong shape, rather than reading no text", async () => {
    for (const body of [{}, { responses: [] }, { responses: "nope" }, { responses: [null] }]) {
      expect(await failure(answering(200, body))).toBeInstanceOf(OcrUnavailableError);
    }
  });
});
