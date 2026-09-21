// Used only by deploy/test-zero-downtime.sh: a stand-in for a crowd of users, so a deploy can be judged by what they saw.
// It requests the site continuously (the health check, the page, and an API call that reads the database) while
// holding one WebSocket open, and counts every request that failed. Needs Node 22+ (global fetch and WebSocket).
//
//   node zero-downtime-probe.js BASE_URL STOP_FILE RESULT_FILE
//
// Runs until STOP_FILE exists, then writes a JSON summary to RESULT_FILE. A request fails if it errors, times out or
// answers with a status the site should never give (5xx, or a 4xx on these routes).
const fs = require("node:fs");

const [base, stopFile, resultFile] = process.argv.slice(2);
if (!base || !stopFile || !resultFile) {
  console.error("usage: node zero-downtime-probe.js BASE_URL STOP_FILE RESULT_FILE");
  process.exit(2);
}

const paths = ["/health", "/", "/auth/dev-users"];
const result = { requests: 0, failed: 0, servedBy: {}, failures: [], websocket: { opened: 0, closed: 0 }, startedAt: new Date().toISOString() };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeOnce(path) {
  result.requests++;
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(5000), redirect: "manual" });
    const colour = response.headers.get("x-served-by") ?? "unknown";
    result.servedBy[colour] = (result.servedBy[colour] ?? 0) + 1;
    await response.arrayBuffer(); // read the whole body: a connection cut mid-response is a failure too
    if (response.status >= 400) throw new Error(`status ${response.status}`);
  } catch (err) {
    result.failed++;
    if (result.failures.length < 20) result.failures.push({ at: new Date().toISOString(), path, error: String(err && err.message ? err.message : err) });
  }
}

let stopping = false;

async function worker(id) {
  let n = id;
  while (!stopping) {
    await probeOnce(paths[n++ % paths.length]);
    await sleep(60);
  }
}

// One long-lived WebSocket, reconnecting like the app's own client does, so the summary shows what a deploy does to it.
async function socket() {
  const url = base.replace(/^http/, "ws") + "/ws";
  while (!stopping) {
    await new Promise((resolve) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        resolve();
        return;
      }
      ws.onopen = () => result.websocket.opened++;
      ws.onclose = () => {
        result.websocket.closed++;
        resolve();
      };
      ws.onerror = () => undefined;
      const watch = setInterval(() => {
        if (stopping) {
          clearInterval(watch);
          ws.close();
          resolve();
        }
      }, 200);
    });
    if (!stopping) await sleep(1000);
  }
}

(async () => {
  const workers = [worker(0), worker(1), worker(2), worker(3), socket()];
  while (!fs.existsSync(stopFile)) await sleep(200);
  stopping = true;
  await Promise.allSettled(workers);
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  process.exit(0);
})();
