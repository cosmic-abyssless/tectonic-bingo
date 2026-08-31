// Thrown by services to signal an HTTP-shaped failure; routes catch this and
// respond with { status, message } instead of a generic 500.
export class ServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ServiceError";
  }
}
