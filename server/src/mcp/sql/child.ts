// Runs the SQL tool's SQLite work (building the replica, answering a query) in a separate Node process, so the site's
// single thread never waits on it.
//
// A process rather than a worker thread: better-sqlite3 runs a statement in one native call, and a worker can't be
// stopped until that call returns, so a runaway query would keep its thread (and the server's shutdown) busy however
// long it takes. A process can be killed at the time limit. The child gets no environment (no secrets) and only the
// input it is handed on stdin.
import { spawn } from "child_process";

/** The child's whole program: plain CommonJS, run with `node -e`, so it works the same under tsx, vitest and dist. */
const CHILD_SCRIPT = String.raw`
const fs = require("fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let out;
  try {
    const job = JSON.parse(input);
    const Database = require(job.driver);
    out = { ok: true, result: job.mode === "build" ? build(Database, job) : query(Database, job) };
  } catch (err) {
    out = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
});

const q = (name) => '"' + name.replace(/"/g, '""') + '"';

// VACUUM INTO a temporary file, keep only the allowed tables and columns, then swap it in as the replica.
function build(Database, job) {
  // Named by this process, so two servers overlapping in a deploy never write the same file.
  const tmp = job.target + "." + process.pid + ".building";
  try {
    return buildInto(Database, job, tmp);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function buildInto(Database, { source, target, allowed }, tmp) {
  fs.rmSync(tmp, { force: true });
  const src = new Database(source, { readonly: true, fileMustExist: true });
  try {
    src.prepare("VACUUM INTO ?").run(tmp);
  } finally {
    src.close();
  }
  const db = new Database(tmp);
  try {
    db.pragma("journal_mode = DELETE");
    db.pragma("foreign_keys = OFF");
    // Dropped rows are zeroed on disk, and the VACUUM below leaves no free pages behind.
    db.pragma("secure_delete = ON");
    for (const { type, name } of db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('trigger', 'view')").all()) {
      db.exec("DROP " + type.toUpperCase() + " IF EXISTS " + q(name));
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
    for (const table of tables) {
      const keep = allowed[table];
      if (!keep) {
        db.exec("DROP TABLE " + q(table));
        continue;
      }
      const columns = db.prepare("SELECT name FROM pragma_table_info(?)").all(table).map((r) => r.name);
      const kept = columns.filter((c) => keep.includes(c));
      if (kept.length === columns.length) continue;
      // Some columns go: rebuild the table from the rest (DROP COLUMN refuses indexed, unique and foreign key columns),
      // then put back the indexes that only use what's left.
      const indexes = db
        .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL")
        .all(table)
        .filter((ix) => db.prepare("SELECT name FROM pragma_index_info(?)").all(ix.name).every((c) => c.name !== null && kept.includes(c.name)));
      const tmpTable = "__replica_" + table;
      db.transaction(() => {
        db.exec("CREATE TABLE " + q(tmpTable) + " AS SELECT " + kept.map(q).join(", ") + " FROM " + q(table));
        db.exec("DROP TABLE " + q(table));
        db.exec("ALTER TABLE " + q(tmpTable) + " RENAME TO " + q(table));
        for (const ix of indexes) db.exec(ix.sql);
      })();
    }
    db.exec("VACUUM");
  } finally {
    db.close();
  }
  fs.renameSync(tmp, target);
  return {};
}

// One read-only statement against the replica: column names and up to rowLimit rows within a character budget.
function query(Database, { path, sql, rowLimit, charBudget, cellLimit }) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  // Throws on more than one statement.
  const stmt = db.prepare(sql);
  // ATTACH, PRAGMA settings and transaction statements count as read-only to SQLite but return no rows: only a
  // statement that returns rows is a query.
  if (!stmt.reader || !stmt.readonly) throw new Error("Only a single read-only statement that returns rows (SELECT, WITH, VALUES) can run.");
  stmt.raw(true);
  const columns = stmt.columns().map((c) => c.name);
  const rows = [];
  let used = 0;
  let cut = null;
  for (const raw of stmt.iterate()) {
    if (rows.length === rowLimit) {
      cut = "rows";
      break;
    }
    const row = raw.map((v) => {
      if (Buffer.isBuffer(v)) return "<blob, " + v.length + " bytes>";
      if (typeof v === "string" && v.length > cellLimit) return v.slice(0, cellLimit) + "… [" + (v.length - cellLimit) + " more characters]";
      return v;
    });
    used += JSON.stringify(row).length + 1;
    if (used > charBudget) {
      cut = "size";
      break;
    }
    rows.push(row);
  }
  db.close();
  return { columns, rows, cut };
}
`;

/** A failure the caller should see (a SQL error, a refused statement), as opposed to the child breaking. */
export class ChildQueryError extends Error {}

export class ChildTimeoutError extends Error {}

const driverPath = () => require.resolve("better-sqlite3");

/** Runs one job in a fresh child process; kills it after `timeoutMs`. */
export function runInChild<T>(job: Record<string, unknown>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", CHILD_SCRIPT], { env: {}, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => reject(new ChildTimeoutError(`stopped after ${timeoutMs} ms`)));
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", (err) => settle(() => reject(err)));
    child.on("close", (code) =>
      settle(() => {
        let out: { ok: true; result: T } | { ok: false; error: string };
        try {
          out = JSON.parse(stdout);
        } catch {
          reject(new Error(`SQL child process exited with code ${code}: ${stderr.slice(0, 2000)}`));
          return;
        }
        if (out.ok) resolve(out.result);
        else reject(new ChildQueryError(out.error));
      }),
    );
    child.stdin.on("error", () => {}); // a child killed early closes its stdin; the close handler reports it
    child.stdin.end(JSON.stringify({ ...job, driver: driverPath() }));
  });
}
