// Checks a branch's migrations against the rules in migrationSafety.ts and exits non-zero if any is broken. CI runs it on
// every pull request (.github/workflows/migration-safety.yml); run it locally before opening one:
//
//   node ../node_modules/tsx/dist/cli.mjs scripts/checkMigrationSafety.ts [--base origin/main]      (from server/)
//
// The rules exist to keep deploys zero-downtime; see migrationSafety.ts. A pull request that has a good reason to break
// one carries the `allow-unsafe-migration` label, which CI turns into ALLOW_UNSAFE_MIGRATION=1: the violations are then
// printed as warnings and the check passes. The label is the reviewer's cue to ask how the change runs against the live
// database and, for a drop or rename, whether the two-deploy pattern was used.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { checkJournalOrder, findDestructiveStatements, formatViolation, type JournalEntry, type Violation } from "./migrationSafety";

const repo = path.resolve(__dirname, "../..");
const git = (...args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

const baseFlag = process.argv.indexOf("--base");
const base = baseFlag >= 0 ? process.argv[baseFlag + 1]! : "origin/main";
const allow = process.env.ALLOW_UNSAFE_MIGRATION === "1";

const listChanged = (filter: string): string[] =>
  git("diff", "--name-only", `--diff-filter=${filter}`, `${base}...HEAD`, "--", "server/drizzle/*.sql").split("\n").filter(Boolean);

const violations: Violation[] = [];

for (const file of listChanged("A")) {
  violations.push(...findDestructiveStatements(file, fs.readFileSync(path.join(repo, file), "utf8")));
}
// Modified, deleted or renamed: a migration that is already on the base branch must never change.
for (const file of listChanged("MDR")) {
  violations.push({ file, line: 1, rule: "edited-migration", text: "this migration is already on the base branch and must not be edited, renamed or deleted (databases that ran it would differ from fresh ones). Add a new migration instead." });
}

const journalPath = "server/drizzle/meta/_journal.json";
const readJournal = (json: string): JournalEntry[] => (JSON.parse(json) as { entries: JournalEntry[] }).entries;
let baseJournal: JournalEntry[] = [];
try {
  baseJournal = readJournal(git("show", `${base}:${journalPath}`));
} catch {
  console.log(`(no journal on ${base}: treating every migration as new)`);
}
violations.push(...checkJournalOrder(baseJournal, readJournal(fs.readFileSync(path.join(repo, journalPath), "utf8"))));

if (violations.length === 0) {
  console.log(`Migration safety: ${listChanged("A").length} new migration(s) against ${base}, all fine.`);
  process.exit(0);
}

const heading = allow ? "Migration safety: ALLOWED by the allow-unsafe-migration label" : "Migration safety: this branch's migrations would not be safe to deploy without downtime";
console.log(`${heading}\n`);
for (const v of violations) console.log(`  ${formatViolation(v)}`);
console.log(
  allow
    ? "\nThe label is set, so this passes. Reviewer: how does this run against the live database while the old version is serving?"
    : "\nA migration runs against the live database while the previous version is still serving, so it must be additive. Drops and renames take two deploys: add the new shape and deploy, move the data, then drop the old shape in the next one. See deploy/README.md, \"Migrations\". If you have thought this through and it really is safe, add the `allow-unsafe-migration` label to the pull request.",
);
process.exit(allow ? 0 : 1);
