---
name: generate-bingo
description: >
  Run or change the test data generator that builds a prod-like Bingo on a
  dev-mode server, local or staging (HTTP, spoofed timestamps, seeded play),
  started from Site admin > Test data or the generate-bingo CLI. Use when the
  user wants to generate a bingo, seed QA data, spin up a prod-like bingo
  (including on staging), tear down testdata, tune the generator, or edit the
  DIFFICULTY table, and when changing server/src/devTools/generateBingo/,
  server/scripts/generate-bingo/ or the generate-bingo docs.
---

# Generate bingo

A job inside the server that imports a board, signs up fake players, runs the
draft, and plays the Bingo through the **real HTTP endpoints** (over loopback),
with `X-Dev-Now` so the audit log reads like a real one. Started from **Site
admin > Test data** (dev-mode servers only: local and staging) or the CLI, which
starts the same job and follows its log. Slugs and fake Discord IDs stay prefixed
`testdata-`. That prefix is the server's delete-guard, not the product name.

How to run: `docs/generate-bingo.md`
Design: `docs/generate-bingo-plan.md`
Why: `docs/generate-bingo-requirements.md`
Code: `server/src/devTools/generateBingo/` (the run and the job), `server/scripts/generate-bingo/` (the CLI)
Vocabulary: `CONTEXT.md` (Bingo, Stage, Player, Captain, Moderator, Submission, Claim, Tile, Part, Task, Line). Not "event". Not "node" in UI copy.

## Run it

Do not generate until the user says yes.

If a task needs a filled Bingo, show the exact command and wait (or point them
at the Test data tab). Ask **stage** and whether to put them on a team
(`--me <discordId>`). Leave the rest at defaults (`live`, `--progress 0.5`,
random seed) unless they override.

```
npm run generate-bingo -- --stage live --progress 0.5 --me <discordId>
```

Omit `--me` if they are not playing. For staging add
`--base https://staging.tectonic.bingo --basic-auth team:<password> --from <slug>`
(the staging password is the user's to give; never guess or store it).

The server only needs dev mode: `DEV_LOGIN_ENABLED=true` and `NODE_ENV` not
`production` (which kills every dev-only hook, whatever else is set). No
integration env is needed: the generator's requests skip OCR and the outside
services themselves. They must have logged in once as `--me`. A full live run is
about 20-30 seconds locally and leaves ~90 users and 1,500-2,500 files until
teardown.

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
- Skip OCR per request with `X-Dev-Skip-Ocr: 1`, and the outside services with
  `X-Dev-Skip-Integrations: 1` (the request context, `audit/context.ts`), not by
  turning them off globally.
- A `testdata-` bingo is never synced to WOM (`womCompetitionService.ts`).
- The generator runs inside the server (`job.ts`) and reads no repo files: keep it
  that way, or it stops working on staging.
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
