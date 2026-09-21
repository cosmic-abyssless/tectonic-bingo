import { describe, expect, it } from "vitest";
import { checkJournalOrder, findDestructiveStatements } from "./migrationSafety";

const find = (sql: string) => findDestructiveStatements("0099_test.sql", sql);

describe("findDestructiveStatements", () => {
  it("passes additive changes: new tables, columns and indexes", () => {
    const sql = [
      "CREATE TABLE `things` (`id` text PRIMARY KEY NOT NULL, `name` text);--> statement-breakpoint",
      "ALTER TABLE `bingos` ADD `slug_note` text;--> statement-breakpoint",
      "ALTER TABLE `bingos` ADD COLUMN `extra` integer DEFAULT 0 NOT NULL;--> statement-breakpoint",
      "CREATE UNIQUE INDEX `things_name_unq` ON `things` (`name`);",
    ].join("\n");
    expect(find(sql)).toEqual([]);
  });

  it("allows dropping an index, which can slow a query but never makes one fail", () => {
    expect(find("DROP INDEX `draft_picks_bingo_pick_unq`;--> statement-breakpoint\nCREATE INDEX `x` ON `t` (`a`);")).toEqual([]);
  });

  it("flags dropping a table", () => {
    const [v] = find("CREATE TABLE a (x);\nDROP TABLE `old_things`;");
    expect(v).toMatchObject({ rule: "destructive", line: 2 });
    expect(v!.text).toContain("drops a table");
  });

  it("flags dropping and renaming a column, and renaming a table", () => {
    expect(find("ALTER TABLE `t` DROP COLUMN `legacy`;")[0]!.text).toContain("drops a column");
    expect(find("ALTER TABLE `t` RENAME COLUMN `a` TO `b`;")[0]!.text).toContain("renames");
    expect(find("ALTER TABLE `t` RENAME TO `u`;")[0]!.text).toContain("renames");
  });

  it("flags drizzle's table rebuild (create new, copy, drop old, rename), which breaks the old version while it runs", () => {
    const sql = [
      "PRAGMA foreign_keys=OFF;--> statement-breakpoint",
      "CREATE TABLE `__new_t` (`id` text PRIMARY KEY NOT NULL, `a` text NOT NULL);--> statement-breakpoint",
      "INSERT INTO `__new_t`(`id`, `a`) SELECT `id`, `a` FROM `t`;--> statement-breakpoint",
      "DROP TABLE `t`;--> statement-breakpoint",
      "ALTER TABLE `__new_t` RENAME TO `t`;--> statement-breakpoint",
      "PRAGMA foreign_keys=ON;",
    ].join("\n");
    expect(find(sql).map((v) => v.text.split(":")[0])).toEqual(["drops a table", "renames a table or column"]);
  });

  it("is case-insensitive and tolerant of whitespace", () => {
    expect(find("drop   table   `x`;")).toHaveLength(1);
    expect(find("alter table `x`\n  drop column `y`;")).toHaveLength(1);
  });

  it("ignores comments and text that merely mentions a destructive statement", () => {
    expect(find("-- DROP TABLE `old`; kept for reference\nCREATE TABLE a (x);")).toEqual([]);
    expect(find("INSERT INTO notes (body) VALUES ('we will DROP TABLE later');")).toEqual([]);
  });

  it("reports the line each statement starts on", () => {
    const sql = "CREATE TABLE a (x);\n\n\nCREATE TABLE b (x);\nDROP TABLE c;";
    expect(find(sql)[0]!.line).toBe(5);
  });
});

const entry = (idx: number, when: number, tag = `000${idx}_m`) => ({ idx, when, tag });

describe("checkJournalOrder", () => {
  const base = [entry(0, 1000), entry(1, 2000)];

  it("passes when the existing entries are untouched and new ones are later", () => {
    expect(checkJournalOrder(base, [...base, entry(2, 3000), entry(3, 4000)])).toEqual([]);
    expect(checkJournalOrder(base, base)).toEqual([]);
  });

  it("flags a new migration dated before the newest existing one, which drizzle would silently skip", () => {
    const [v] = checkJournalOrder(base, [...base, entry(2, 1500)]);
    expect(v).toMatchObject({ rule: "journal-order" });
    expect(v!.text).toContain("drizzle would skip it");
  });

  it("flags one dated the same as the newest existing one", () => {
    expect(checkJournalOrder(base, [...base, entry(2, 2000)])).toHaveLength(1);
  });

  it("flags two new migrations that are out of order with each other", () => {
    expect(checkJournalOrder(base, [...base, entry(2, 5000), entry(3, 4000)])).toHaveLength(1);
  });

  it("flags an existing entry that was changed or removed", () => {
    expect(checkJournalOrder(base, [entry(0, 1000), entry(1, 2500)])).toHaveLength(1);
    expect(checkJournalOrder(base, [entry(0, 1000)])).toHaveLength(1);
    expect(checkJournalOrder(base, [entry(0, 1000, "0000_renamed"), entry(1, 2000)])).toHaveLength(1);
  });
});
