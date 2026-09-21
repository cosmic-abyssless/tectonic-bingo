# Generate bingo

Creates a realistic, prod-like bingo on a **running dev server** so changes can be
QA'd against something true to life instead of hand-inputting every action. It goes
through the real HTTP endpoints (so audit rows and every side effect are real) with
**spoofed timestamps**, so the actions are spread over days the way real play is.
Requirements: `docs/generate-bingo-requirements.md`. Design:
`docs/generate-bingo-plan.md`.

## Quick start

1. Start the dev server with the integrations that would otherwise reach out turned
   off (all of these are already documented in `.env.example`):

   ```
   DEV_LOGIN_ENABLED=true
   PLAYER_STATS_FETCH_DISABLED=true
   WOM_COMPETITION_SYNC_DISABLED=true
   TECTONIC_API_URL=          # blank: no clan-membership check on signup
   ```

   (`NODE_ENV=production` disables every dev-only feature below, whatever else is set.)
2. Sign in to the site once as the account you want to QA with (so it exists as a dev
   user), and make sure a site admin exists (the dev DB's `dev_admin` does).
3. Run it:

   ```
   npm run generate-bingo -- --stage live --progress 0.5 --me <your discordId>
   ```

   It prints what it does and ends with the bingo's URL (`/b/testdata-...`) and the
   teardown command. A full run takes about 20-30 seconds.
4. When you're done: `npm run generate-bingo:teardown -- --slug testdata-...` (or `--all`).
   **Do tear down.** A full run leaves 1,500-2,500 uploaded files (screenshots and
   their resized variants) and ~90 users behind otherwise.

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
| `--export` | repo-root `tectonic-comics-bingo-export.json` | the board to import |
| `--dry-run` | off | print the timeline and counts, send nothing |

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
  `server/scripts/generate-bingo/board.ts`; a test fails if a tile is missing from it.
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
admin and a "me" user), then start the server with the env above plus `PORT=3055`,
`DB_PATH=<file>` and `UPLOADS_DIR=<dir>`, and run
`npm run generate-bingo -- --base http://localhost:3055 --admin <admin discordId> ...`. To see
it in a browser, start Vite with `VITE_PORT=<free port> VITE_API_TARGET=http://localhost:3055`
(as `playwright.config.ts` does).

Pointing a second server at your *normal* dev database also works, so the generated bingo
shows up in your usual dev site. Start it on another port with the env above (a blank
`TECTONIC_API_URL` in the environment beats the one in `.env`) and leave your own server
running. Two servers writing one SQLite file can occasionally fail a request with
"database is locked" (a few submissions out of hundreds), which the generator lists as
refused; a private database avoids it.

## What was added to the server for this

Only reachable in dev mode (`isDevModeActive()` in `server/src/devMode.ts`, the one
check for it):

- `X-Dev-Now: <ISO date>` on any request sets that request's clock (`server/src/clock.ts`;
  services call `now()` instead of `new Date()`). A malformed value is a 400. Ignored
  outside dev mode.
- `X-Dev-Skip-Ocr: 1` skips the background screenshot analysis on a submission.
- `POST /api/dev/users`, `GET /api/dev/bingos`, `DELETE /api/dev/bingos/:slug`,
  `POST /api/dev/bingos/:slug/fake-stats` (`server/src/routes/dev.ts`, site admin only,
  `testdata-` prefix enforced): make a throwaway user, list generated bingos, tear one down
  completely (bingo, audit rows, uploaded files and their variants, and users nothing else
  uses), and give a bingo's signups made-up player stats.

## Tuning

- Difficulty and who can do what: `DIFFICULTY` in `board.ts`.
- How fast the board fills: `PACE_EXPONENT` in `simulate.ts` (1 is a straight line).
- How many mods review, and when: `chooseMods` in `people.ts`.
- Anything random goes through the seeded `Rng` (`rng.ts`), so keep it that way or runs
  stop being repeatable.
