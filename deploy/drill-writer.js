// Used only by deploy/restore-drill.sh: writes rows into the app's database the way the app would (WAL mode, small
// committed transactions, an occasional checkpoint) so Litestream has real changes to replicate while it runs.
//   node drill-writer.js BATCHES ROWS_PER_BATCH PAUSE_MS
// Run inside the app image (NODE_PATH=/app/node_modules). Prints the table's row count when done.
const Database = require("better-sqlite3");

const [batches = 40, rows = 100, pauseMs = 30] = process.argv.slice(2).map(Number);
const db = new Database(process.env.DB_PATH ?? "/data/sqlite/bingo.db");
db.pragma("journal_mode = WAL");
db.exec("create table if not exists drill_marker (id integer primary key, note text not null, at text not null)");

const insert = db.prepare("insert into drill_marker (note, at) values (?, ?)");
const writeBatch = db.transaction((n) => {
  for (let i = 0; i < n; i++) insert.run(`row ${Math.random().toString(36).slice(2)}`, new Date().toISOString());
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  for (let b = 0; b < batches; b++) {
    writeBatch(rows);
    if (b % 10 === 9) db.pragma("wal_checkpoint(PASSIVE)");
    await sleep(pauseMs);
  }
  console.log(db.prepare("select count(*) as n from drill_marker").get().n);
  db.close();
})();
