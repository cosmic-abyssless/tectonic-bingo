// Thrown by services to signal an HTTP-shaped failure; routes catch this and
// respond with { status, message } instead of a generic 500.
export class ServiceError extends Error {
  status: number;
  // A stable string a client can branch on without parsing `message` (e.g. "cut_review_required" on the
  // stage-change guard); most ServiceErrors have none and are shown as-is.
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ServiceError";
  }
}
