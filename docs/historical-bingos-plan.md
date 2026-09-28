# Historical Bingos: plan

> **PLAN, discussed 2026-09-28.** Import past Bingos, run on other websites, so this site holds the clan's whole Bingo
> history. See `CONTEXT.md` → **Historical Bingo**. Tier 1 (sparse Bingos) is ready to build; Tier 2 (rich Bingos)
> waits on database access.

## Goal

This site is the source of truth for every future Bingo, and past Bingos should be here too. Old sites had different
data models and much less data, so an imported Bingo is marked **Historical**, and the site is honest about what it
doesn't know.

This is **not** the existing Bingo export and import, which only copies board templates between environments.
Historical imports have their own format, script and upload.

## Two tiers

- **Tier 1, sparse Bingos.** There are several; building for them can start now. Roughly each has:
  - dates, rules, and a picture per Tile (a whole-board image is split by hand before import);
  - a Wise Old Man team competition;
  - its Teams, Captains, and final standings, known and entered by hand;
  - Discord ids for its Players, supplied by the maintainers.
- **Tier 2, rich Bingos.** At least 3, run on sites whose databases we'll try to get from their creators. They add per-Team Tile
  completion, drops, and more. Each site gets a converter that outputs the Tier 1 core format, extended. Parked until
  the databases are in hand.

## Historical Bingo (both tiers)

- **Stage and editing:** always Finished and read-only. The stage can't change and the normal editors don't apply. It's
  listed in the main Bingo list with a **Historical** badge, which also shows in its header.
- **Board:** the original grid size, with each Tile's picture and name. Opening a Tile shows its picture, its points
  if known, and any rules for it. There's no checklist, progress or per-Team completion (Tier 2 can add completion
  later).
- **What it shows:** the rules, the Teams with their Captains and Players, the standings, and a Wise Old Man gains
  leaderboard from the competition.
- **Not recorded:** the Draft, signups (the page), the audit log, Achievements, Wrapped, Rewind and Titles. Pages or
  sections that depend on data the Bingo doesn't have say "Not recorded for historical Bingos", never zero or empty.
- **Access:** as for any Finished Bingo, every clan member can view it.

## Identity

- **One user per Player,** found or created by Discord id.
  - A current clan member's details come from the Tectonic API (`getTectonicMembership`).
  - Someone who has left the clan is created named by the RSN they played under, with `inGuild = false`. They're locked
    out like any non-member, but they're in the history. If they rejoin and log in, Discord fills in their details and
    the history is already theirs.
- **Signups:** every Player gets a Signup in the historical Bingo with the RSN they played under (from the WOM
  competition), so naming, player cards and "past Bingos" on profiles work as for any Bingo.
- **Unmapped Players:** a Player whose Discord id isn't known must be marked `unknown` in the source. They're left off
  the Teams and appear only in the WOM leaderboard. No made-up Discord ids.
- **Captains:** every Team's Captain (and co-captain, if there was one) is named in the source. No guessing.

## Process (once per Bingo, run locally)

1. **Source folder** per Bingo:
   - `bingo.yaml`:
     - name, dates and board size (rows and columns);
     - rules (Markdown);
     - the WOM competition id;
     - Teams: name, Captain and co-captain, and Players as `{ rsn, discordId | "unknown" }`;
     - standings: Team name, place, and points if known;
     - optional per-Tile names, points and rules.
   - `tiles/r1c1.png` … one image per Tile, by position.
2. **The script** (`server/scripts/historical/`), run locally:
   - validates the folder;
   - fetches the WOM competition (participants, teams, gains);
   - cross-checks Teams against it;
   - enforces the Discord-id-or-`unknown` and Captain rules;
   - writes an **import bundle**: JSON plus the images;
   - prints a report of what mapped, what's `unknown`, and any mismatches with WOM.
3. **Check it locally:** import the bundle into the local DB and look at it in the browser.
4. **Import to production:** upload the bundle through **Site admin → Import historical Bingo**. The server
   validates it, creates the Bingo, users, Signups, Teams, Tiles, images, standings and the WOM competition record in one
   transaction, and audits it. Writes happen inside the app, never directly against the production DB.

## Work items

**Tier 1 (ready):**
1. **Historical Bingo in the app:**
   - the flag;
   - read-only, always Finished;
   - the badge in the list and header;
   - the Tile modal without a checklist;
   - the standings and Teams display;
   - the WOM leaderboard;
   - the "not recorded" empty states and the hidden features.
2. **Bundle format and the server importer,** with the Site admin upload.
3. **The local script** for sparse Bingos (source folder to bundle, and the report).

**Tier 2 (waiting on database access):** a converter per rich site, extending the format with per-Team Tile completion
and drops, plus the app changes to show them.
