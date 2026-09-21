import { describe, expect, it } from "vitest";
import { MulterError } from "multer";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { ServiceError } from "./services/errors";
import { shouldReportError } from "./errorReporting";

describe("shouldReportError", () => {
  it("ignores the app refusing a request on purpose", () => {
    expect(shouldReportError(new ServiceError(400, "That player has already been drafted"))).toBe(false);
    expect(shouldReportError(new ServiceError(403, "Only site admins can undo a pick"))).toBe(false);
    expect(shouldReportError(new ServiceError(404, "Bingo not found"))).toBe(false);
    expect(shouldReportError(new ServiceError(409, "This player was drafted onto the team"))).toBe(false);
  });

  it("reports a ServiceError that is a server failure", () => {
    expect(shouldReportError(new ServiceError(500, "boom"))).toBe(true);
    expect(shouldReportError(new ServiceError(503, "Screenshot analysis is disabled"))).toBe(true);
  });

  it("ignores the OCR service being unreachable, which is expected when it restarts, and an unreadable image", () => {
    expect(shouldReportError(new OcrUnavailableError("the OCR service could not be reached"))).toBe(false);
    expect(shouldReportError(new OcrImageError(new Error("truncated png")))).toBe(false);
  });

  it("ignores an oversized or otherwise rejected upload", () => {
    expect(shouldReportError(new MulterError("LIMIT_FILE_SIZE"))).toBe(false);
  });

  it("ignores client errors raised by Express and body parsers", () => {
    expect(shouldReportError(Object.assign(new Error("request entity too large"), { status: 413 }))).toBe(false);
    expect(shouldReportError(Object.assign(new SyntaxError("Unexpected token"), { statusCode: 400 }))).toBe(false);
  });

  it("reports anything unexpected", () => {
    expect(shouldReportError(new TypeError("Cannot read properties of undefined (reading 'after')"))).toBe(true);
    expect(shouldReportError(Object.assign(new Error("db locked"), { status: 500 }))).toBe(true);
    expect(shouldReportError("a thrown string")).toBe(true);
    expect(shouldReportError(undefined)).toBe(true);
  });
});
