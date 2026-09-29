// A sparse Historical Bingo (CONTEXT.md, #310) built straight into the DB, the way the historical importer (#311)
// leaves one: Finished and `historical`, Teams with Captains, Players with Signups under their old RSNs (one who has
// left the clan), Tiles with pictures and no Tasks, standings, and a stored Wise Old Man competition with an
// `unknown` Player in it. Used by the server tests.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;

export interface HistoricalFixtureOptions {
  slug?: string;
  name?: string;
  createdByUserId: string;
  guildId?: string;
  womId?: number;
  /** The picture for the Tile at (row, col), 0-based. Defaults to a placeholder path. */
  imageUrl?: (row: number, col: number) => string | null;
  theme?: string;
}

export interface HistoricalFixture {
  bingo: typeof schema.bingos.$inferSelect;
  teams: (typeof schema.teams.$inferSelect)[];
  players: (typeof schema.users.$inferSelect)[];
  tiles: (typeof schema.tiles.$inferSelect)[];
}

const TEAMS = [
  { name: "Fire Giants", color: "#e74c3c", players: ["Ember Lord", "Pyre Fly", "Ash Heap"], place: 1, points: 212 },
  { name: "Ice Trolls", color: "#3498db", players: ["Frostbyte", "Cold Snap", "Rime Wolf"], place: 2, points: 187 },
  { name: "Moss Knights", color: "#27ae60", players: ["Lichen", "Old Oak", "Fern Gully"], place: 3, points: null },
];

// Old RSNs of Players who have left the clan: created named by their RSN, with inGuild false.
const LEFT_CLAN = new Set(["Ash Heap"]);

const TILE_NAMES = ["Vorkath", "Zulrah", "Barrows", "Corp", "Raids", "Nex", "Wintertodt", "Tempoross", "Slayer"];

export function seedHistoricalBingo(db: Db, opts: HistoricalFixtureOptions): HistoricalFixture {
  const slug = opts.slug ?? "historical-2023";
  const startsAt = new Date("2023-06-01T18:00:00Z");
  const endsAt = new Date("2023-06-15T18:00:00Z");
  return db.transaction((tx) => {
    const bingo = tx
      .insert(schema.bingos)
      .values({
        slug,
        name: opts.name ?? "Summer Bingo 2023",
        description: "Run on another site before this one",
        theme: opts.theme ?? "default",
        stage: "complete",
        historical: true,
        achievementsEnabled: false,
        boardRows: 3,
        boardCols: 3,
        rulesMarkdown: "## Rules\n\n- Drops count from the start time.\n- Screenshots must show the team codeword.",
        startsAt,
        endsAt,
        createdByUserId: opts.createdByUserId,
      })
      .returning()
      .get();

    const players: (typeof schema.users.$inferSelect)[] = [];
    const teams: (typeof schema.teams.$inferSelect)[] = [];
    // Numeric like a real Discord id, and unique per fixture slug, so several fixtures can share a DB.
    const idBase = 900000000000000000n + BigInt([...slug].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1_000_000, 7)) * 1000n;
    TEAMS.forEach((t, ti) => {
      const members = t.players.map((rsn) => {
        const discordId = String(idBase + BigInt(ti * 10 + t.players.indexOf(rsn)));
        const left = LEFT_CLAN.has(rsn);
        const user = tx
          .insert(schema.users)
          .values({ discordId, discordUsername: left ? rsn : rsn.toLowerCase().replace(/\s+/g, ""), discordGlobalName: left ? null : `${rsn} (now)`, inGuild: !left })
          .returning()
          .get();
        players.push(user);
        tx.insert(schema.signups).values({ bingoId: bingo.id, userId: user.id, rsn, createdAt: startsAt }).run();
        return user;
      });
      const team = tx
        .insert(schema.teams)
        .values({ bingoId: bingo.id, captainUserId: members[0]!.id, name: t.name, codeword: `code${ti + 1}`, color: t.color })
        .returning()
        .get();
      teams.push(team);
      members.forEach((m, i) => tx.insert(schema.teamMembers).values({ teamId: team.id, userId: m.id, isCaptain: i === 0 }).run());
      tx.insert(schema.historicalStandings).values({ bingoId: bingo.id, teamId: team.id, place: t.place, points: t.points }).run();
    });

    const tiles: (typeof schema.tiles.$inferSelect)[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const i = row * 3 + col;
        const node = tx.insert(schema.nodes).values({ bingoId: bingo.id, kind: "ALL", points: i === 4 ? 0 : 10 + i }).returning().get();
        tiles.push(
          tx
            .insert(schema.tiles)
            .values({
              bingoId: bingo.id,
              nodeId: node.id,
              name: TILE_NAMES[i]!,
              imageUrl: opts.imageUrl ? opts.imageUrl(row, col) : `/uploads/historical-${row}-${col}.png`,
              boardRow: row,
              boardCol: col,
              rulesText: i === 4 ? null : `Any unique from ${TILE_NAMES[i]}.`,
            })
            .returning()
            .get(),
        );
      }
    }

    const participations = [
      ...TEAMS.flatMap((t, ti) => t.players.map((rsn, i) => ({ rsn, teamName: t.name, gained: 180 - ti * 30 - i * 25 }))),
      // An `unknown` Player (CONTEXT.md "Historical Bingo"): no known Discord id, so no user, no Team, no Signup.
      { rsn: "Mystery Man", teamName: "Moss Knights", gained: 42.5 },
    ].map((p) => ({ player: { username: p.rsn.toLowerCase().replace(/\s+/g, "_"), displayName: p.rsn }, teamName: p.teamName, progress: { start: 0, end: p.gained, gained: p.gained } }));
    tx.insert(schema.womPastCompetitions)
      .values({
        guildId: opts.guildId ?? process.env.DISCORD_GUILD_ID ?? "",
        womId: opts.womId ?? 12345,
        bingoId: bingo.id,
        title: "Summer Bingo 2023",
        metric: "ehb",
        startsAt,
        endsAt,
        participantCount: participations.length,
        dataJson: JSON.stringify({ title: "Summer Bingo 2023", metric: "ehb", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), type: "team", participations }),
      })
      .run();

    return { bingo, teams, players, tiles };
  });
}
