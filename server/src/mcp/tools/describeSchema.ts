import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as z from "zod";
import * as schema from "../../db/schema";
import { isDenied, SQL_TABLES } from "../sql/classification";
import { currentReplica, REPLICA_INTERVAL_MS } from "../sql/replica";
import { defineTool } from "../tool";
import { replicaAge } from "./runSql";

/** Each column's SQL type, by table and column name, from the Drizzle schema. */
function columnTypes(): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    out.set(config.name, new Map(config.columns.map((c) => [c.name, c.getSQLType()])));
  }
  return out;
}

const NOTES = [
  `Read-only SQLite over a copy of the site's database, rebuilt every ${REPLICA_INTERVAL_MS / 60_000} minutes. Private data is left out of the copy: login sessions and links, OAuth apps and tokens, Captains' pick ratings and notes, who voted for whom in Superlatives, and the Wise Old Man verification code.`,
  "Scores aren't a column anywhere. A Team's points come from completing nodes of the Requirement Tree (team_node_state) under rules such as gates and Exclusive Items, plus Point Adjustments, and a Player's Points share is computed from the Claims that completed each award. For points use bingo_summary, tile_stats and player_contributions, not SQL.",
  "Timestamps are unix seconds (datetime(col, 'unixepoch')), except audit_log.created_at, which is milliseconds. Booleans are 0/1. ids are UUID text.",
  "Inside a Bingo a Player is named by the RSN they signed up with: join signups on (bingo_id, user_id) for signups.rsn.",
  "A Submission's Team is submissions.team_id, its Bingo teams.bingo_id. Claims hang off submissions; nodes of kind ITEM/MANUAL are the leaves they claim. A submission of kind 'proof' is a Proof screenshot, not a drop: filter to kind = 'drop' when counting drops.",
];

export const describeSchema = defineTool({
  name: "describe_schema",
  title: "Describe the SQL schema",
  description: "The tables and columns run_sql can query, with what each means in the site's terms, and how old the data is. Call it before writing SQL.",
  input: z.object({}),
  run: () => {
    const types = columnTypes();
    // The schema doesn't need the copy; its age only when there is one.
    const { dataAsOf, dataAge } = currentReplica() ? replicaAge() : { dataAsOf: null, dataAge: "the copy isn't built yet" };
    const tables = Object.entries(SQL_TABLES).flatMap(([name, cls]) => {
      if (isDenied(cls)) return [];
      return [
        {
          name,
          ...(cls.note ? { note: cls.note } : {}),
          columns: Object.entries(cls.columns)
            .filter(([, c]) => !isDenied(c))
            .map(([column, note]) => ({ name: column, type: types.get(name)?.get(column) ?? "", ...(note ? { note } : {}) })),
        },
      ];
    });
    return { notes: NOTES, dataAsOf, dataAge, tables };
  },
});
