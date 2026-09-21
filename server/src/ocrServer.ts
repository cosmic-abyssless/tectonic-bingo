// Entry point of the `ocr` container: serves the OCR engine over HTTP so screenshot analysis has its own CPU and can
// neither slow the site down nor be starved by it. See ocrProtocol.ts for the contract and ocrApp.ts for the routes.

// Must stay the first two imports, for the same reasons as in index.ts.
import "./env";
import "./instrument";
import * as Sentry from "@sentry/node";
import { installProcessLogHandlers, log } from "./log";
import { createOcrApp } from "./ocrApp";
import { OCR_MAX_IMAGE_BYTES } from "./ocrConfig";
import { isOcrReady, recognizeLocally, warmOcrEngine } from "./ocrEngine";

installProcessLogHandlers();

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const app = createOcrApp({ recognize: recognizeLocally, isReady: isOcrReady, maxBytes: OCR_MAX_IMAGE_BYTES });

const server = app.listen(port, () => {
  log.info("ocr service listening", { port });
  // Always warm here (unlike the in-process engine): this container exists to read screenshots, so a person's first
  // submission after a deploy should never wait for the model. If the model can't be loaded this container can do
  // nothing useful, and an unhealthy container is not restarted by Docker, so exit and let it be.
  void warmOcrEngine().then((ready) => {
    if (ready) return;
    log.error("ocr model could not be loaded; exiting so the container is restarted");
    void Sentry.close(2000).finally(() => process.exit(1));
  });
});

function shutdown(signal: string) {
  log.info("shutdown", { signal });
  server.close(() => process.exit(0));
  // In-flight recognitions get a few seconds; then stop regardless (Compose sends SIGKILL after its own grace period).
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
