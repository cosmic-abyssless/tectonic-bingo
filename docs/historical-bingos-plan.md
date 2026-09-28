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

**Tier 2 (rich Bingos):** see below. The first site's data is in hand.

## Tier 2: rich imports

Designed 2026-09-28 against the first rich site's data. **The old sites' details (hosts, endpoints, Players) stay out of
this public repo:** they live in `data/` (gitignored) and in converters kept on a local, unpushed branch. Everything
below is generic.

### What a rich site gives us

A typical rich Bingo, like the first one:
- the board: Tiles with name, rules text, picture and position;
- two Parts per Tile, each with its points and rule text, and one of two kinds:
  - *N different Items* from a list;
  - *N in total* of an Item;
- the Items each Part accepts, wildcards included;
- every claim: Part, Team, Player, Item, quantity, screenshot, submitted and reviewed times, approved or rejected;
- Teams and their Players (old ids, usernames, RSNs);
- the site's own final leaderboard and each Team's points per day.

It's joined with the event's other records:
- the signup form's responses (a spreadsheet);
- the draft order (a screenshot, transcribed by hand);
- per-Player Proof screenshots on some Tiles (see "Proof screenshots" below).

### Decisions

- **A full rebuild.** The Bingo is recreated in our own model and **our scoring engine recomputes it** from the imported
  Submissions:
  - a Part becomes a Task: *N different Items* is a COUNT over Item rows, and *N in total* is a SUM;
  - Part B uses "Withhold points until previous" where the old rules held B's points until A was done;
  - Lines and their bonus come from the converter's config;
  - where the rules text has a freeze, the Tile gets its Freeze period;
  - a Part that can't be expressed falls back to a manual Task, and the report lists it.
- **Our totals are the ones shown.** The converter compares our recomputed per-Team totals and daily points with the old
  site's, as a check on our modelling only. A gap means a rule was modelled wrong: fix the rule and re-run. There are no
  Point Adjustments to force a match, and the old site's leaderboard isn't shown.
- **Claims become Submissions:**
  - credited to the Player who got the drop;
  - carrying their screenshot, and one Claim (the Item and quantity);
  - approved or rejected at the original times.
  - **Rejected claims are imported too,** as rejected Submissions with no reviewer or reason, which the old site didn't record.
- **Signups, from the form's responses:**
  - a Signup per response, at its original time, with the RSN it gave;
  - **every question kept as text, exactly as typed:** a short or long text question each, with the default visibility
    (Captains); no multiple choice;
  - the typed time zone is mapped, best-effort, to a real time zone where the app needs one, and left blank where it's
    unclear;
  - administrative columns (Discord name, the terms acknowledgement) aren't questions; the Discord name only helps map
    Discord ids;
  - a signup that didn't end up on a Team is imported as **Cut**. No one is marked withdrawn.
- **The Draft,** from the transcribed screenshot:
  - each Team's column lists its Captain, its co-captain (picked ahead of the draft), then one pick per round, top to
    bottom;
  - the rounds snaked across Teams 1 to 6;
  - imported as draft picks with their pick numbers;
  - the Draft room is viewable by anyone who can see the Bingo, as for any Bingo from the Draft on.
- **Identity:**
  - Players match across sources by RSN first, then by the old site's username, then by Discord name;
  - anything left over goes in a mapping file the maintainer completes, including renamed accounts and nicknames in the
    draft screenshot;
  - Discord ids come from a mapping sheet the converter pre-fills from the Discord names, for the maintainer to
    complete; the Tier 1 rules then apply.
- **Features that come back:** Stats, **Titles**, **Rewind**, the signups roster and the Draft room work from the
  imported data. Titles that need data we don't have, mainly the Wise Old Man-based ones, say "Not recorded" rather
  than going to the wrong Player. **Wrapped stays off:** it's something we make at the end of a Bingo, not a record of
  one. The audit log and Achievements stay "Not recorded". "Not recorded" is decided by whether the data is there, not by
  a feature list fixed for Historical Bingos.
- **Screenshots are imported as the original files** (PNG, about 1 GB for the first site). The server makes its usual
  smaller versions.
- **Proof screenshots** (per Player, per Tile) wait for the Proof screenshots feature (#318). They're imported through it
  once it exists, not bolted onto Submissions.

### Screenshots are uploaded separately

A single 1 GB upload is fragile. The import goes in two steps:
1. The **data bundle** creates the Bingo with every Submission's screenshot marked pending.
2. The local script **uploads the screenshots one at a time** to an Admin endpoint that attaches each to its Submission.
   It's resumable, it skips screenshots already attached, and it goes through the normal upload pipeline.

### Work items (Tier 2)

1. **Bundle format and importer, extended for rich Bingos** (public, generic):
   - Tasks with requirement trees, and Lines;
   - Submissions and Claims (approved or rejected, with their times);
   - Signups with text answers, and Cut signups;
   - draft picks;
   - pending screenshots;
   - scoring recomputed after the import.
2. **The screenshot attach endpoint:** resumable, one file per request.
3. **Rich Historical Bingos in the app:** turn "not recorded" into a per-feature, data-driven check, and turn on the
   board's completion, Submissions, Stats, Titles (with "Not recorded" where data is missing), Rewind, the signups roster
   and the Draft room.
4. **The first site's converter** (local and private):
   - raw data, form responses and the draft transcription in, bundle out;
   - the mapping files;
   - the verification report against the old site's totals and daily points;
   - the screenshot upload run.
