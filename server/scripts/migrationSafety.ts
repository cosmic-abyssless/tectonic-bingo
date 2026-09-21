// The rules a database migration must follow to be safe in a zero-downtime deploy, as pure functions so they can be
// tested. checkMigrationSafety.ts is the command line around them (run by CI on every pull request).
//
// Why the rules exist: a deploy applies the new version's migrations to the LIVE database while the old version is still
// serving (docs/zero-downtime-deploy-plan.md). So a migration must not break code that still runs against the old shape.
//
//   1. Additive only. New tables, new nullable or defaulted columns and new indexes are safe. Dropping or renaming a table
//      or a column is not: the old version would start failing the moment the migration ran. Such a change takes two
//      deploys (add the new shape and deploy; move the data; drop the old shape in the next deploy).
//   2. Never edit a migration that is already on main. Databases that applied it keep the old version (drizzle tracks
//      migrations by hash), so a fresh database and a live one would silently end up with different schemas.
//   3. New migrations must be dated after every existing one. Drizzle applies migrations in journal timestamp order and
//      SKIPS any dated earlier than the newest one already applied, so an out-of-order migration is quietly never run.

export interface Violation {
  file: string;
  line: number;
  rule: "destructive" | "edited-migration" | "journal-order";
  text: string;
}

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

// Statements that break the old version. DROP INDEX is deliberately absent: dropping an index can slow a query but never
// makes one fail. Each pattern is matched at the start of a statement.
const DESTRUCTIVE: { pattern: RegExp; what: string }[] = [
  { pattern: /^DROP\s+TABLE\b/i, what: "drops a table" },
  { pattern: /^DROP\s+(VIEW|TRIGGER)\b/i, what: "drops a view or trigger" },
  { pattern: /^ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN\b/i, what: "drops a column" },
  { pattern: /^ALTER\s+TABLE\s+\S+\s+RENAME\b/i, what: "renames a table or column" },
];

/** Removes `-- comments` (but not the `--> statement-breakpoint` markers, which are only separators). */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => (line.trimStart().startsWith("-->") ? "" : line.replace(/--.*$/, "")))
    .join("\n");
}

/** Finds the statements in one migration file that would break a running old version. */
export function findDestructiveStatements(file: string, sql: string): Violation[] {
  const violations: Violation[] = [];
  const cleaned = stripComments(sql);
  let offset = 0;
  for (const raw of cleaned.split(";")) {
    const statement = raw.trim();
    const leading = raw.length - raw.trimStart().length;
    const line = cleaned.slice(0, offset + leading).split("\n").length;
    offset += raw.length + 1;
    if (!statement) continue;
    const hit = DESTRUCTIVE.find((rule) => rule.pattern.test(statement));
    if (hit) violations.push({ file, line, rule: "destructive", text: `${hit.what}: ${statement.replace(/\s+/g, " ").slice(0, 120)}` });
  }
  return violations;
}

/**
 * Compares the journal on the base branch with the one on this branch: existing entries must be untouched, and every new
 * entry must be dated after the newest existing one (and after the one before it), or drizzle will skip it.
 */
export function checkJournalOrder(base: JournalEntry[], head: JournalEntry[], journalFile = "server/drizzle/meta/_journal.json"): Violation[] {
  const violations: Violation[] = [];
  const problem = (text: string): void => void violations.push({ file: journalFile, line: 1, rule: "journal-order", text });

  base.forEach((entry, i) => {
    const now = head[i];
    if (!now || now.tag !== entry.tag || now.when !== entry.when) problem(`the existing migration ${entry.tag} was changed or removed in the journal`);
  });

  const newestBase = base.reduce((max, entry) => Math.max(max, entry.when), 0);
  let previous = newestBase;
  head.slice(base.length).forEach((entry) => {
    if (entry.when <= previous) {
      problem(`${entry.tag} is dated ${new Date(entry.when).toISOString()}, which is not after the previous migration (${new Date(previous).toISOString()}): drizzle would skip it on a database that already ran the newer one. Regenerate it after merging main.`);
    }
    previous = Math.max(previous, entry.when);
  });
  return violations;
}

export function formatViolation(v: Violation): string {
  return `${v.file}:${v.line}  [${v.rule}]  ${v.text}`;
}
