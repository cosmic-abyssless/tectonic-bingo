---
name: mock-wom-competition
description: >
  Run the mock-wom-competition script that fakes a Wise Old Man competition
  for an existing bingo's signups, no network call. Use when the user wants
  to test the past-competition feature (#128), see the "Past bingos" section
  populate on a player profile, or exercise the Past WOM competitions admin
  panel without a real WOM competition id.
---

# Mock WOM competition

Inserts a fabricated `wom_past_competitions` row: one participation per RSN
already signed up to the given bingo, each with a random `gained` value.
Negative `womId`, so it can never collide with (or be mistaken for) a real
fetched competition. No call to the real WOM API — this isn't simulating a
player action, it's faking third-party data, the same exception
`fillFakeStats` already makes for signup WOM/CA stats.

Code: `server/scripts/mock-wom-competition.ts`, `pastWomCompetitionService.mockPastCompetition`
Route: `POST /api/dev/bingos/:slug/mock-wom-competition` (dev mode + site admin only)

## Run it

Works against any bingo that already has signups — `demo` (from
`db:seed:dev`, since #133) or a `testdata-` one from `generate-bingo`. The
bingo needs signups first; a bare `db:seed:dev` bingo with none will 400.

```
npm run mock-wom-competition -- --slug demo
```

Options: `--title`, `--metric` (default `ehp`), `--gained-min`/`--gained-max`
(default 5-500), `--admin <discordId>`, `--base <url>`.

Same dev server env as `generate-bingo`: `DEV_LOGIN_ENABLED=true`.

Then open a player's profile card, or `/admin` → Past WOM competitions, to
see it.

## Change it

- Not fenced to `testdata-` bingos like `devTestDataService`'s other helpers:
  it only adds one row, never touches users/teams/submissions. See the
  comment on `mockPastCompetition` before changing that.
- Tearing down a `testdata-` bingo (`generate-bingo:teardown`) deletes any
  mock competition tied to it. Deleting a real bingo only detaches a real
  one (`bingoService.deleteBingo`) — it's meant to outlive the bingo.
