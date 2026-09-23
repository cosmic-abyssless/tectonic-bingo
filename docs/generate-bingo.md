# Generate bingo

Creates a realistic, prod-like bingo on a **dev-mode server** (your local one, a private one, or staging) so
changes can be QA'd against something true to life instead of hand-inputting every action. It goes through the
real HTTP endpoints (so audit rows and every side effect are real) with **spoofed timestamps**, so the actions are
spread over days the way real play is. Requirements: `docs/generate-bingo-requirements.md`. Design:
`docs/generate-bingo-plan.md`.

The run happens **inside the server** (`server/src/devTools/generateBingo/`): a background job that calls the
server's own endpoints over loopback, logging in as its made-up players through dev-login. You start it from the
browser or from the command line; either way the server does the work, so it runs the same on staging, where nobody
can run a script next to the server.

## Before you start

The server must be in **dev mode**: `DEV_LOGIN_ENABLED=true`, and `NODE_ENV` anything but `production`
(`NODE_ENV=production` switches off every dev-only feature below, whatever else is set). Local dev servers usually
are; staging always is (`deploy/env/staging.env.example`). Nothing else needs setting: the generator's requests skip
the screenshot OCR and the outside services themselves (see "What was added to the server"), so your normal dev
server works as it is, integrations and all.

## From the browser (local or staging)

**Site admin > Test data** (the tab only appears on a dev-mode server). Pick the bingo whose board to copy (its
tiles, lines, rules and signup questions; nothing else), where to leave the new bingo, and whether to put yourself on
a team, then **Generate**. The log streams in underneath; a full live run takes about half a minute locally and a
minute or two on staging. Generated bingos are listed below it with a **Tear down** button. **Do tear down**: a full
run leaves 1,500-2,500 uploaded files (screenshots and their resized variants) and ~90 users behind otherwise.

One run at a time per server.

## From the command line

```
npm run generate-bingo -- --stage live --progress 0.5 --me <your discordId>
```

This starts the same job on the server (`--base`, default `http://localhost:3001`) and prints its log as it goes.
By default it sends the repo's board (`tectonic-comics-bingo-export.json`, so it works on an empty server);
`--from <slug>` copies a bingo already on the server instead. It ends with the bingo's URL (`/b/testdata-...`) and
the teardown command:

```
npm run generate-bingo:teardown -- --slug testdata-...    (or --all)
```

`--me` needs to be an account that has logged in to that server once.

**Against staging**, add the address and the shared password Caddy asks for (the same one the browser asks for):

```
npm run generate-bingo -- --base https://staging.tectonic.bingo --basic-auth team:<password> --from <slug> --me <your discordId>
```

(`GENERATE_BINGO_BASIC_AUTH=team:<password>` in the environment works too, and keeps it out of your shell history.)
The teardown script takes the same `--base` and `--basic-auth`.

## Options

| option | default | meaning |
|---|---|---|
| `--stage` | `live` | where to leave the bingo: `signup`, `captains`, `draft` (mid-draft), `reveal`, `live`, `complete` |
| `--progress` | `0.5` | live only: how far through the event we are, 0.02-1 |
| `--days` | `9` | length of the event |
| `--teams` | `6` | |
| `--team-size` | `14` | (88 signups for 6x14: a few end up as cut leftovers) |
| `--mods` | `3` | mods besides the admin |
| `--me` | none | your discordId: you sign up, get drafted onto a team, and are made a mod |
| `--admin` | first site admin | the admin the run acts as |
| `--seed` | random (printed) | the same seed and options give the same people, choices and outcomes |
| `--slug` | `testdata-<date>-<time>` | must start with `testdata-` |
| `--base` | `http://localhost:3001` | the server |
| `--from` | none | a bingo on the server to copy the board from |
| `--export` | repo-root `tectonic-comics-bingo-export.json` | the board to send, when `--from` isn't given |
| `--basic-auth` | `GENERATE_BINGO_BASIC_AUTH` | `user:password` for a server behind a shared password (staging) |
| `--dry-run` | off | print the timeline and counts, send nothing |

The Test data tab has the same settings (the admin is you, and the slug is always the default).

The dates follow from the stage. For `live --progress 0.5` on 9/19 with a 9-day event:
it starts about 4.5 days ago and ends in 4.5, with the signup, captains, draft and
reveal stages before that, each at a believable time. For a stage still ahead of the
target (say `signup`), the later dates are simply scheduled in the future.

## What it does

1. Imports the board and sets the dates (signups open, draft, reveal, start, end).
2. **Signups** (through the real endpoint), front-loaded over the signup window, with
   about 60% of players pairing up as duos (request, then accept). Each player fills in the
   board's signup questions (read from the imported bingo, so whatever is added is answered):
   required ones always, optional ones about half the time, an exact "yes" where a question asks for
   one, their own UTC offset for a time zone, and more boss choices for stronger players. Without
   this a required question makes the server refuse every signup. Then every signup is
   given made-up WOM, RuneProfile and combat achievement stats (the ones the signup seed
   tool uses, random, not seeded), because signing up with the integrations off leaves
   them empty and the roster's stats columns would be blank.
3. **Captains** (the best players; a duo captain brings their partner as co-captain)
   create the teams, then the **real draft** runs: the admin sets the pick order, starts
   the draft, and captains pick in turn a minute or so apart, favouring better players,
   with the admin stepping in for a few picks. (To try the pick-order ceremony yourself,
   leave the bingo at `--stage captains` and move it to the draft stage in the mod panel.)
4. **Reveal**: teams get names and members raise hands on the parts they mean to do.
5. **Live**: an hourly simulation (see below), then, for `complete`, the mods clear the
   queue and an admin completes the bingo.

### How the play is made realistic

- Every player has an **RSN** (what they sign up with) and a different **Discord username**
  (`<rsn>_dc<n>`), like a real player, so a screen that shows the Discord name where it should
  show the RSN is easy to spot: search the page for `_dc`.
- Players have a **skill**, hours a day they play, and a timezone: quiet overnight,
  busiest in the evening. Whether a player can do a given part at all is decided once, so
  only a subset of a team can do the hard content (TOB ISSUE 2 Page 2 needs a Scythe or
  hard mode drops: about 1 in 8 players can) while nearly everyone can do slayer bosses
  and the wildy tiles. The per-tile numbers are the `DIFFICULTY` table in
  `server/src/devTools/generateBingo/board.ts`; a test fails if a tile is missing from it.
- Each team has a **target** for how much of the board it will have done by the end
  (50-95%, better teams a little higher), so most teams don't finish, and its own liking
  for each tile, so teams push different ones. Progress is paced along the schedule that
  target implies.
- Players go for **lines** (a tile that would complete a row, column or diagonal, or bring
  one to one tile away) and for **the tile bonus** once one page is done.
- **Mods are few**: each has a few times of day they sit down and clear everything
  pending in one batch (most of the time), so submissions pile up while they're asleep
  (median wait about 3 hours, the longest about half a day).
- **Some drops are posted by a teammate**: about one submission in eight is uploaded by another
  player on the team for the one who got the drop (a drop on mobile, posted from a PC), so the
  "posted by" wording, the audit "on behalf of" and the credit in the stats all have examples.
  It is drawn from its own random stream, so it never shifts anything else in a seeded run.
- **Rejections are rare**: on the first day some players' first submission is rejected
  ("Codeword not visible...") and re-submitted 10-60 minutes later; after that about 1%.
  One approval is undone and re-approved a few minutes later. Occasionally a mod adjusts
  a team's points by +15.
- Everything is stamped in date order, so the audit log reads the way a real one would.

## PETS and SLAYER BOSSES (pages that share their items)

On these tiles both pages hold the *same* items, on purpose: a drop counts toward each
page once, so the same pet can't be counted twice, and Page 2's target includes what
Page 1 already has. Page 2 is also submit-gated behind Page 1. The server used to refuse
every first claim on such a tile (it checked the gate of *every* page above the item), so
neither page could ever be started; a claim is now refused only when every page it counts
toward is gated (`submitGateBlock` in `graphService.ts`). The generator mirrors that rule
in `board.ts`, plays these tiles like any other, and still checks for parts that can never
be finished (a warning is printed if the board ever has one).

The current board no longer shares SLAYER BOSSES items between pages: Page 2 has its own
copy, and the bingo's *exclusive item* rules (pets: one tile, the tile's own 40 slayer uniques: one page,
see `docs/exclusive-items-plan.md`) stop a team using one drop twice. The generator reads
the rules from the imported bingo, and a simulated team never plans or posts a claim the
rules would refuse. It draws that part's plan again a few times, then leaves the part alone.

## Running against a private server (leave your dev database alone)

The generator writes a lot. To keep it out of your normal dev database, run a second
server on another port with its own DB and point the generator at it (this is how it
was tested): create a migrated database the way `e2e/prepare-db.cjs` does (with an
admin and a "me" user), then start the server in dev mode with `PORT=3055`,
`DB_PATH=<file>` and `UPLOADS_DIR=<dir>`, and run
`npm run generate-bingo -- --base http://localhost:3055 --admin <admin discordId> ...`. To see
it in a browser (and use the Test data tab there), start Vite with
`VITE_PORT=<free port> VITE_API_TARGET=http://localhost:3055` (as `playwright.config.ts` does).

## What was added to the server for this

Only reachable in dev mode (`isDevModeActive()` in `server/src/devMode.ts`, the one
check for it):

- `X-Dev-Now: <ISO date>` on any request sets that request's clock (`server/src/clock.ts`;
  services call `now()` instead of `new Date()`). A malformed value is a 400. Ignored
  outside dev mode.
- `X-Dev-Skip-Ocr: 1` skips the background screenshot analysis on a submission.
- `X-Dev-Skip-Integrations: 1` keeps a request away from the outside services: for that
  request the clan API reads as not configured (no membership check on signup, no clan
  profiles in the draft room, no roster names) and no WOM/RuneProfile stats are fetched.
  The audit middleware puts it on the request's context (`server/src/audit/context.ts`), and
  `getTectonicClient()` and `fetchAndPersistPlayerStats()` honour it, so it covers every route
  at once. The generator sends it on every request, which is why no integration needs
  turning off to run it.
- A `testdata-` bingo is never synced to WOM (`womCompetitionService.ts`), in any mode: its
  made-up players must never become a real competition.
- `POST /api/dev/generate` starts a run in the server (`server/src/devTools/generateBingo/job.ts`,
  one at a time), from another bingo's board (`from: <slug>`) or a sent `document`, and
  `GET /api/dev/generate?after=<n>` reports it with the log lines after the n-th. The Test data
  tab and the CLI both use them. The run acts as the admin who started it and reaches the
  server over `http://127.0.0.1:$PORT` with `X-Forwarded-Proto: https` (so the Secure session
  cookie still works on staging).
- `POST /api/dev/users`, `GET /api/dev/bingos`, `DELETE /api/dev/bingos/:slug`,
  `POST /api/dev/bingos/:slug/fake-stats` (`server/src/routes/dev.ts`, site admin only,
  `testdata-` prefix enforced): make a throwaway user, list generated bingos, tear one down
  completely (bingo, audit rows, uploaded files and their variants, and users nothing else
  uses), and give a bingo's signups made-up player stats.

## Tuning

All in `server/src/devTools/generateBingo/` (the CLI in `server/scripts/generate-bingo/` only
starts runs and follows them):

- Difficulty and who can do what: `DIFFICULTY` in `board.ts`.
- How fast the board fills: `PACE_EXPONENT` in `simulate.ts` (1 is a straight line).
- How many mods review, and when: `chooseMods` in `people.ts`.
- Anything random goes through the seeded `Rng` (`rng.ts`), so keep it that way or runs
  stop being repeatable.
