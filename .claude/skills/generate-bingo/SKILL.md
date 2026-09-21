---
name: generate-bingo
description: >
  Run or change the generate-bingo CLI that builds a prod-like Bingo on a
  running dev server (HTTP, spoofed timestamps, seeded play). Use when the
  user wants to generate a bingo, seed QA data, spin up a prod-like bingo,
  tear down testdata, tune the generator, or edit the DIFFICULTY table, and
  when changing server/scripts/generate-bingo/ or the generate-bingo docs.
---

# Generate bingo

A CLI that imports the real board, signs up fake players, runs the draft, and
plays the Bingo through the **real HTTP endpoints**, with `X-Dev-Now` so the
audit log reads like a real one. Slugs and fake Discord IDs stay prefixed
`testdata-`. That prefix is the server's delete-guard, not the product name.

How to run: `docs/generate-bingo.md`
Design: `docs/generate-bingo-plan.md`
Why: `docs/generate-bingo-requirements.md`
Code: `server/scripts/generate-bingo/`
Vocabulary: `CONTEXT.md` (Bingo, Stage, Player, Captain, Moderator, Submission, Claim, Tile, Part, Task, Line). Not "event". Not "node" in UI copy.

## Run it

Do not generate until the user says yes.

If a task needs a filled Bingo, show the exact command and wait. Ask **stage**
and whether to put them on a team (`--me <discordId>`). Leave the rest at
defaults (`live`, `--progress 0.5`, random seed) unless they override.

```
npm run generate-bingo -- --stage live --progress 0.5 --me <discordId>
```

Omit `--me` if they are not playing.

Env the server must already have (printed by the CLI too; see `.env.example`):

```
DEV_LOGIN_ENABLED=true
PLAYER_STATS_FETCH_DISABLED=true
WOM_COMPETITION_SYNC_DISABLED=true
TECTONIC_API_URL=
```

`NODE_ENV=production` kills every dev-only hook, whatever else is set. They
must have logged in once as `--me`. A full live run is about 20-30 seconds and
leaves ~90 users and 1,500-2,500 files until teardown.

After a successful generate, tell them teardown is an option. Never run
teardown unless they ask.

```
npm run generate-bingo:teardown -- --slug testdata-...
npm run generate-bingo:teardown -- --all
```

Options, private-server setup, and what the simulation actually does live in
`docs/generate-bingo.md`. Do not copy that table here.

## Change it

Hard rules (do not reopen):

- Every write goes through a real HTTP endpoint. No direct DB inserts for play.
- Time is spoofed only with `X-Dev-Now`, and only when `isDevModeActive()`.
- Skip OCR per request with `X-Dev-Skip-Ocr: 1`, not by turning OCR off globally.
- All randomness goes through the seeded `Rng` in `rng.ts`.
- Dev routes and those headers do nothing when the dev gate is off.
- Teardown and fake users stay fenced to the `testdata-` prefix
  (`TESTDATA_PREFIX` in `server/src/services/devTestDataService.ts`).
- Do not touch the E2E suite.
- Use the words in `CONTEXT.md`.

Where to tune:

- Tile difficulty / who can do what: `DIFFICULTY` in `board.ts`
- How fast the board fills: `PACE_EXPONENT` in `simulate.ts`
- Mod review cadence: `chooseMods` in `people.ts`

A given `--seed` plus the same options must produce the same people, picks, and
outcomes (fake WOM/CA stats on signups are the documented exception).
