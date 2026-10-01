# Historical Bingos: the bundle script

Turns a past Bingo that ran on another website into a **historical bundle**. A Site Admin then uploads the bundle
through **Site admin → Bingos → Import historical**, which creates it as a read-only Historical Bingo
(`CONTEXT.md`, `docs/historical-bingos-plan.md`).

This script is for *sparse* Bingos: the board pictures, the Teams, the standings and a Wise Old Man competition.
It only reads the folder you give it and calls the Wise Old Man and Tectonic APIs. It never touches a database.

## 1. Fill in a source folder

One folder per Bingo:

```
summer-2023/
  bingo.yaml
  tiles/
    r1c1.png   (row 1, column 1)
    r1c2.jpg
    ...        (one picture per board cell: png, jpg or webp, up to 5 MB each)
```

`bingo.yaml`:

```yaml
name: Summer Bingo 2023
slug: summer-2023                 # the Bingo's URL: lowercase letters, numbers and hyphens
description: Run on the old site  # optional
start: 2023-06-01T18:00:00Z
end: 2023-06-15T18:00:00Z
rows: 5
cols: 5
womCompetitionId: 12345           # optional: without it there's no Wise Old Man leaderboard
rules: |                          # optional, Markdown
  ## Rules
  - Drops count from the start time.

teams:
  - name: Fire Giants
    color: "#e74c3c"              # optional, quoted
    captain: Ember Lord           # by RSN, one of the Team's players
    coCaptain: Pyre Fly           # optional
    players:
      - { rsn: Ember Lord, discordId: "123456789012345678" }
      - { rsn: Pyre Fly, discordId: "234567890123456789" }
      - { rsn: Mystery Man, discordId: unknown }
      - { rsn: Iron Pyre, wom: Pyre Main, discordId: "345678901234567890" }   # wom: see below

standings:
  - { team: Fire Giants, place: 1, points: 212 }   # points are optional
  - { team: Ice Trolls, place: 2 }

tiles:                            # optional, per position
  r1c1: { name: Vorkath, points: 10, rules: Any unique from Vorkath. }
  r1c2: { name: Zulrah }
```

The rules for Players:
- Every Player has a real Discord id, quoted so YAML keeps every digit, or `unknown`. Never make one up.
- An `unknown` Player is left off their Team and shows only on the Wise Old Man leaderboard.
- Every Team names its Captain, who needs a Discord id. Don't guess.
- `rsn` is the name they played under then, which the Bingo shows. When their account is in the Wise Old Man
  competition under another name (renamed since, or a main whose ironman played), give that name as `wom:`, so the
  leaderboard still connects them.
- A Tile left out of `tiles:` is named after its position (`Tile r2c3`), and the report lists it.

A complete example is in [`fixture/`](fixture/). Its Discord ids and Wise Old Man competition are made up.

### Splitting a whole-board picture

When the old site only left one picture of the whole board, cut it into one picture per cell before you run the
script. For a board with even cells (a 5x5 board in `board.png`), ImageMagick can do it:

```
magick board.png -crop 5x5@ +repage +adjoin tiles/cell-%02d.png
```

That writes the cells row by row as `cell-00.png` to `cell-24.png`. Rename each one to its position: `cell-00` is
`r1c1`, `cell-04` is `r1c5`, `cell-05` is `r2c1`, and so on. If there are borders or labels between the cells, crop
each cell by hand in any image editor instead. Only the pictures in `tiles/` named like `r1c1` are used.

## 2. Make the bundle

The script needs `TECTONIC_API_URL`, `TECTONIC_API_KEY` and `TECTONIC_GUILD_ID` in the root `.env`, to ask the clan
API who is still a member. `WOM_API_KEY` is optional. From the repo root:

```
npm run historical:bundle -- path/to/summer-2023
```

It:
1. checks `bingo.yaml` and `tiles/`, giving each problem with its line (`bingo.yaml:19:14: ...`);
2. fetches the Wise Old Man competition and compares it with the Teams: missing Players, extra Players, and Teams
   that don't match;
3. asks the Tectonic API about each Discord id. A clan member's new user is named from the clan's records. Anyone
   who has left is named by the RSN they played under and is locked out like any non-member. Existing users are never
   changed on import;
4. writes `<folder>/<slug>.historical.json` (or `--out <file>`), after running the same check the server runs on upload;
5. prints a report of who is in the clan and who isn't, the `unknown` Players, Wise Old Man mismatches, Tiles without
   names, and anything skipped.

It exits non-zero on any error and writes no bundle. Warnings and mismatches don't block, but read them: a Player
missing from Wise Old Man often means a typo in an RSN.

Options:
- `--out <file>`: where to write the bundle.
- `--wom-file <file>`: use a saved `GET /competitions/{id}` response instead of fetching one.
- `--skip-clan`: don't ask the Tectonic API. Every Player is then taken as having left the clan. This is for trying
  the script out, not for a real import.

## 3. Check it locally

Start the app locally (`npm run dev`), log in as a Site Admin, and upload the bundle under **Site admin → Bingos →
Import historical**. The page shows any problems before the upload. The server checks the bundle again, including
whether the slug is taken. Look over the Bingo: the board, the Tile rules, the standings, the Teams and the Wise Old
Man leaderboard.

To try it with the example folder:

```
npm run historical:bundle -- server/scripts/historical/fixture --wom-file server/scripts/historical/fixture/wom-competition.json --skip-clan
```

That writes `server/scripts/historical/fixture/sample-historical-2024.historical.json`. It's gitignored, so delete it
when you're done.

To import a bundle again, delete the Bingo first (Site admin → Bingos). Its Wise Old Man competition is kept and
re-linked by the next import.

## 4. Import to production

Upload the same file on the production site, as a Site Admin. It's created in one go: a bundle with any problem
creates nothing. The import is recorded in the audit log as "Historical Bingo imported".
