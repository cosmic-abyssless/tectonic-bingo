# Domain Model: Tectonic Bingo

This glossary defines the shared language for the Tectonic Bingo platform. Every concept here has a single canonical name. Code, UI copy, and discussions must match these terms. Implementation details do not belong here.

---

## The Event

### Bingo
A single OSRS clan bingo competition, run from start to finish across a set of lifecycle stages.
- **Synonyms (tolerated, not canonical):** Event.
- **Rules:** Has its own board, rules, participants, teams, moderators, and pot. Scoped by a unique slug.
- **Not:** A tournament, a season.

### Stage
The current lifecycle phase of a Bingo. Transitions move forward through a fixed sequence. The name in bold is the canonical one, used in UI copy, discussion and this glossary; the code value is engineering-only.
1. **Planning** (`planning`) — Admin configures board, tiles, rules, signup questions. Hidden from normal players.
2. **Signups open** (`signup`) — Players submit signups (solo or duo). Admins review and approve. Captains can already scout the signups.
3. **Signups closed** (`captains`) — The roster is final and signups are locked. Captains keep scouting until the draft starts.
4. **Draft** (`draft`) — Captains take turns picking players/duos in structured rounds. Every signed-up player and everyone already on a team can watch.
5. **Board revealed** (`reveal`) — Teams are set; the board is visible for prep, but submissions are not yet accepted.
6. **Live** (`live`) — The Bingo is running. Submissions are accepted and reviewed; points accumulate.
7. **Finished** (`complete`) — The Bingo has ended. Final scores are locked, winners declared.
- **Avoid:** "captains stage" in discussion or UI copy. It is the code value for Signups closed and reads as if it were about the Captain role.

### Codeword
A unique, secret text phrase generated for a Bingo (or a stage of it) that players must show in their verification screenshots (e.g. spoken in public chat, or in a clan chat message) to prove the screenshot was taken during this specific Bingo.

### Pre-load
A task or requirement that players are permitted to prepare before the Bingo goes `live` (or before a specific gate opens), such as obtaining a clue scroll or gathering a secondary ingredient, but not completing the final step.
- **Rules:** Must be explicitly enabled on the specific Part/Task (`allowsPreLoad`).

---

## Roles & Identity

### Site Admin
An infrastructure administrator with complete platform access.
- **Capabilities:** Can create, edit, and delete any Bingo; change site-wide settings; automatically acts as a Moderator on every Bingo.
- **Not:** An in-game clan rank.

### Admin
A site-wide administrator with permission to create, configure, and manage Bingos and site settings.
- **Capabilities:** Create Bingos, manage signup questions, assign Captains and Moderators, transition stages, override scores.
- **Note:** In the current system, Site Admin and Admin share the top-tier site administrative role; Site Admin implies infrastructure ownership.

### Moderator
A trusted clan member whose elevated permissions are scoped to a single specific Bingo, granted by an Admin (or inherited by Site Admins).
- **Capabilities:** Review submissions (approve / reject), view all team boards, inspect audit logs, adjust team points manually.
- **Not:** Change the Bingo's stage or run the draft's pick order; those are for Admins. The stage read-out shows, without the buttons.
- **Rules:** A Moderator **can** also be a Player in the same Bingo, and **is permitted** to approve their own team's submissions, as they are trusted clan members.

### Captain
A designated player who leads a Team during a Bingo.
- **Capabilities:** Participates in the Draft to pick players/duos for their team; represents the team in disputes.
- **Rules:** Assigned by an Admin, from the signups as they come in, while signups are open or closed. Exactly one or two captains per team.

### Player
Any clan member participating in a Bingo as a competitor.
- **Capabilities:** Sign up, view the board, make Submissions for their team, view team progress.
- **Rules:** Belongs to exactly one Team per Bingo once drafted.
- **Name:** Inside a Bingo a Player is named by the RSN they signed up with, not their Discord name (rosters, submissions, stats, the audit log, the draft, the header). The server puts it on `rsn` for every user it sends within a Bingo, and `playerName` prefers it. An account with no Signup in that Bingo, like a Moderator who isn't playing, falls back to the Discord name, as do site-level lists. A Discord name is only shown where it is labelled as one (the "Discord" columns of the roster and draft room, the profile subtitle). Audit entries written before this keep the names they were stored with.

---

## Signups & Drafting

### Signup
A player's registration for a specific Bingo, submitted during the `signup` stage.
- **Status:** Active or Withdrawn.
- **Rules:** Includes answers to custom signup questions set by the Admin (e.g. timezone, gear tier, OSRS RSN).
- **Question types:** Short text, long text, yes/no, **single choice** (radio buttons, one option) and **multiple choice** (checkboxes, any number of options). A multiple-choice answer is stored as a JSON list and shown as "Melee, Magic"; a required one needs at least one option ticked.
- **Question helper text:** Each signup question can carry optional plain-text helper text (up to 500 characters), shown under it on the signup form. It is exported and imported with the Bingo.

### Duo
Two players who register to enter the Bingo together and must be drafted onto the same team as a single unit.
- **Synonyms:** Pair (acceptable synonym), Pairing (internal record).
- **Rules:** Both players must confirm the pairing. Consumes a single pick in a duo-draft round. A player signs up first and pairs afterwards: the pairing is a separate, deferrable step, not a precondition of signing up.

### Cut
A signup left out of the Draft so that every Team comes out the same shape. Pairs and singles (solo players) are split across the Teams separately: every Team drafts the same number of pairs and the same number of singles, and whatever doesn't split evenly is cut, newest signups first. Who's cut changes while signups are open; mods see it on the Signups tab and again before moving into the Draft stage.
- **Synonyms:** At risk (while signups are still open and it can change). Avoid "leftover" (the old name).
- **Draft cuts setting** (`cutMode`):
  - **Pairs + singles** (`even`; "Even teams" in a solo Bingo) — pairs and singles are each split evenly; the remainder of each is cut.
  - **Pairs only** (`pairs_only`, duo Bingos only) — only pairs are drafted, split evenly; every single is cut. Mods can pair singles up by hand to keep them in.
  - **No cuts** (`none`) — everyone is drafted, in any order; Teams may end up different sizes.
- **Share:** What every Team drafts under the setting, e.g. "1 pair and 1 single". Captains pick in any order, but a Team that has its share of pairs can't take another pair (likewise singles).

### Draft
The structured selection process during the `draft` stage where Captains take turns selecting Players (or Duos) onto their Teams.
- **Mechanics:** Snake draft or linear, divided into rounds.

- **Draft room:** The page where the Draft happens. Captains and Moderators enter it once signups are open; every signed-up Player and everyone already on a Team can watch once the Draft stage begins.
- **On the clock:** The Team whose Captain is picking now. Shown to everyone as who is currently picking, with the round and pick number; the Captain on the clock also gets a stronger cue that it is their turn. There is no pick timer.

### Scouting
Captains (and Moderators) looking through the signups before the Draft, during Signups open and Signups closed.
- **Rules:** Not visible to ordinary Players until the Draft stage.

### Pick Rating
A Team's private note on a signup while scouting: 1 to 3 stars and a short note.
- **Rules:** Written by the Team's Captains only, shared between them, and carried into the Draft. Rating either half of a Duo rates both. Never shown to other Teams.

### Team
The group of Players a Captain leads, formed by the Draft. Has a name, a color, and one or two Captains.

---

## The Board & Requirements

### Board
The full grid of Tiles presented to players for a Bingo.
- **Geometry:** Configurable grid of rows and columns (e.g. 5x5).

### Tile
A single visual cell on the Board.
- **Rules:** A Tile is a presentation wrapper around one root requirement. It has a position on the grid, an optional category, an image, and optional notes.
- **Composition:** A Tile contains one or more **Parts**.
- **Synonyms (theme-specific):** Comic Issue, Comic Book (in the comic theme, clicking a Tile opens it as an issue/comic book).
- **Player experience:** Players click a Tile to open its details (or open the comic issue in comic theme).

### Part
A distinct top-level section, milestone, or page within a Tile.
- **Rules:** A Tile has one or more Parts. In the comic theme, each Part gets its own dedicated story page (e.g. "Part 1 of 2"). A Part awards its own points or gates subsequent Parts.
- **Composition:** A Part contains one or more **Tasks** or a hierarchy of **Conditions**.
- **Engineering note:** Corresponds to the immediate children of the Tile's root node in the requirement graph (`tile.node.children`).

### Task
A concrete objective, check, or nested requirement that must be satisfied.
- **Structure:** Tasks can be concrete leaves (obtaining a specific Item drop or a manual verification) OR composite conditions (ALL, ANY, COUNT, SUM) grouping further child Tasks or Items.
- **Synonyms:** Leaf (engineering term for indivisible item/manual task), Requirement.
- **Forbidden synonyms:** "Node" (never expose to players or in UI copy).

### Item
An individual OSRS item, as a leaf of the Requirement Tree, matched by its OSRS item name.
- **Rules:** Usually a Task on its own ("Get a Twisted bow"). The same name can be an Item in several places on one Board. The Items on the Board are every Item leaf anywhere on it.
- **Not:** A Claim. The Item is what's asked for; the Claim is one drop of it.

### Requirement Tree (Conditions)
The recursive structure inside a Part or Task defining how objectives combine:
- **Condition Types:**
  - `ALL` — "Complete all of"
  - `ANY` — "Complete any one of"
  - `COUNT` — "Complete at least N of" (e.g., any 2 out of 5)
  - `SUM` — "Collect N in total across" (e.g., 500 total kill count or secondary ingredients)
- **Leaves:**
  - `ITEM` — An in-game item drop, tracked by OSRS item name and quantity.
  - `MANUAL` — An objective manually judged/verified by a Moderator.

### Category
A grouping label applied to Tiles (or rows/columns) to organize the Board thematically (e.g. "PvM", "Skilling", "Minigames", "Wilderness").

### Line
A completed sequence of Tiles across the Board (row, column, diagonal, or custom line) that awards bonus points when every Tile in the sequence is completed.

### Freeze Period
A mandatory delay configured on a Tile: once a team completes the Tile, other teams cannot score it (or it cannot be scored again) until the freeze duration expires.

---

## Submissions & Scoring

### Submission
A single proof package submitted by a player on behalf of their Team to claim completion of one or more Tasks on a Tile.
- **Composition:** Contains one or more Screenshots and associated Claims.
- **Status:** `pending` → `approved` | `rejected`.
- **Reviewer:** Must be reviewed by a Moderator (or Admin/Site Admin).
- **Feedback:** Rejections must include reviewer notes so the team knows what went wrong.
- **Whose drop / who posted:** A Submission belongs to the Player who got the drop (`submittedBy`: credited on the board, in the stats and in the mod queue). When someone else uploaded it, that Player is recorded as the poster (`postedBy`, shown as "posted by"), and the audit entry has them acting on behalf of the Player. This is the usual case of a teammate at a PC posting a drop from mobile.
- **Who may post for whom:** A Player posts to their own Team, for themselves or any teammate. A Moderator (or Admin) may also submit to any Team of the Bingo while viewing it, and must say which of its Players the drop belongs to. The Bingo must be live either way.
- **Changing the credit:** A Moderator can move a Submission's credit to another Player of its Team ("Change player" in the mod queue), in any state, when the poster forgot to pick who it was for. The credit moves; the review, the points and the Team don't. The original uploader stays as the poster, and the change is recorded in the audit log.

### Screenshot
An image attached to a Submission proving in-game completion.
- **Types:** Main drop screenshot, pre-screenshot (for pre-loaded tasks), bank screenshot, collection log screenshot, other.
- **Verification:** Scanned for the Bingo's Codeword and item name via OCR/text-matching; verified by a human Moderator during review.

### Claim
The specific allocation of a single drop or achievement within a Submission to a single leaf Task.
- **Audience:** Primarily a Moderator and engineering concept. Players experience this as "submitting proof for [Task]".
- **Rules:** If a single screenshot proves three items, the Submission contains three Claims.

### Shared Item Pool & Distinct Drops (Non-Duplication)
How multi-part Tiles handle identical or overlapping item lists between Parts:
- **Independent Parts (Default):** Part A and Part B have their own separate Tasks/leaves. Part B accepts any drop matching its list, even if it's the exact same item type/name that completed Part A (e.g. two separate Primordial Crystals).
- **Shared Pool (Non-Duplication across Parts):** Part A and Part B share the exact same underlying Item leaves via graph references.
  - To prevent Part B from completing with the same item drop that satisfied Part A, the tile is structured as progressive thresholds over the shared leaves:
    - For distinct items ("unique drops"): Part A is `COUNT(1)` and Part B is `COUNT(2)` over the shared leaves. Completing Part B strictly requires obtaining a *distinct* item that was not used for Part A.
    - For cumulative item counts: Part A is `SUM(1)` and Part B is `SUM(2)` over the shared leaves, requiring additional drops beyond Part A.
- **Rule:** A single physical drop (`Claim`) cannot be reused to fulfill two distinct items in a `COUNT` condition.

### Exclusive Item
An Item a Team may use in **one place only**: a Claim on it locks the same Item everywhere else for that Team, but still counts only where it was submitted.
- **Example:** A pet counts on its boss's Tile *or* on the Pets Tile, not both. Several of the same pet on one Tile all count. On Slayer Bosses, a unique used for Page 1 is spent for Page 2.
- **Scope:** Each rule limits the Item to one **Tile** (any of its Parts) or one **Part**.
- **Set up:** Per Bingo, in the settings, as a list of item names plus a scope, started from a Tile or Part of the board, an Item Group (a snapshot) or nothing, and editable item by item; matched by item name. Each place keeps its own copy of the Item.
- **Rules:** A pending or approved Claim locks the Item; a rejection frees it. The server refuses the Claim and the board shows "Used on ...". If a rule is added after Claims exist, the earliest Claim's place is the one that scores.
- **Not:** A Shared Item Pool. Sharing one Item between Parts makes a Claim count toward *each*; an Exclusive Item is the opposite: one place, chosen by where the Claim is submitted.

### Point Adjustment
A manual grant or deduction of points applied to a Team by a Moderator or Admin, with a required written reason, outside regular Tile completions.

### Points share
A Player's portion of their Team's points, credited from the Claims that completed each award.
- **Rules:** Each award (a Task, Part or Tile bonus) is split between the Players whose approved Claims were on the path that completed it, weighted by quantity: ALL counts every child, ANY the first child to complete, COUNT N the first N, SUM N and item quantities in approval order, capped at what was still needed. Claims approved after the award, or on branches that didn't decide it, earn nothing. A Tile bonus, and each Tile's equal part of a Line bonus, go to Players by their share of that Tile. Point Adjustments are left out. Shown to two decimal places.
- **Not:** A count of Submissions. Many easy Claims don't beat one Claim that completed a raid Part.

### Stats
The Bingo's stats page: points over time, the timeline, top contributors (ranked by Points share) and tile completion.
- **Rules:** Moderators see every Team at every stage. While the Bingo is Live a Player sees only their own Team; once it is Finished everyone sees every Team. "First to complete" events are shown to Moderators throughout and to Players only once the Bingo is Finished.

### Luck
How unlikely a drop, or a dry streak, was: "1 in N". Judged against the Item's real drop rate and the kills the Player gained at its bosses during the Bingo, as counted by Wise Old Man.
- **Rules:** A drop is judged over the kills since the Player's previous drop of the same Item (or the Bingo's start), up to the drop, so grinding on afterwards doesn't lessen it. The kills are never understated: a count missing from Wise Old Man makes a drop look less lucky, never more. A dry streak is judged against every Item on the Board the boss drops, and ends at the Player's last drop of one of them. Only Items from bosses Wise Old Man counts have luck (not Slayer monsters, minigames or skilling). A raid counts one completion as one kill, at a typical run's rates.
- **Not:** Points share, or GP value. A 1-in-1,000 pet is very lucky and worth nothing.

### Useful drop
A drop that still moved its Task forward when it came, judged by the Items that were still open on the Task (the last missing piece of a set is rarer than the first, when any of them would do).
- **Rules:** A drop that earned no Points share is not useful.

### GP value
What a Claim's drop is worth in GP (gold pieces, the game's currency): the item's Grand Exchange price times its quantity, fixed when the Submission is made.
- **Rules:** Priced at the midpoint of the item's latest buy and sell prices. A charged item that isn't sold on the Grand Exchange is priced as its uncharged version (Craw's bow as Craw's bow (u), Tumeken's shadow as its (uncharged) version). It may arrive shortly after the Submission is made and is never changed once set. A Claim with no item (a MANUAL task), or an item with no Grand Exchange price and no Piece value (e.g. a pet), has no GP value, shown as "—".
- **Not:** A scoring source. GP value never earns or costs points.
- **Re-price:** A Moderator can price a Submission's Claims again, when a value is wrong because it was priced from the wrong thing (before its Task got a Valued as, or before its item had a Piece value). Not for bringing values up to today's prices. A Claim that can't be priced right now keeps its value. Recorded in the audit log.
- **Re-pricing a Task:** Changing a Task's Valued as once Submissions have a GP value from it asks whether to re-price them too (only that Task's Claims, at today's prices) or leave them and apply it to new Submissions only.

### Valued as
An optional setting on an item Task: Claims on that Task get their GP value from another item ÷ N instead of their own item's price.
- **Example:** On a DT2 boss's page, the Gold ring Task is valued as that boss's vestige ÷ 3. A gold ring is an ordinary tradeable item (~160 GP), but from these bosses it counts as a third of the vestige, and which vestige depends on the boss. The page's vestige Task is valued the same way (its own vestige ÷ 3), so on that tile a vestige counts like a ring roll, while its Piece value (the whole vestige) still applies everywhere else.
- **Source:** An optional short name for where these Claims come from ("Vardorvis"), shown dimmed next to the item wherever its GP value is listed, with the valuation on hover, so players see why an ordinary-looking item is worth so much. Without a Source, the valuation itself is shown.
- **Rules:** Set per Task in the board editor, saved with the board (exported and imported with the Bingo). The named item is priced like any other, including its Piece value. One value per Task, so a Task that could be claimed from several sources worth different amounts has to be split into one Task per source (issue #189).
- **Not:** A Piece value. A Piece value prices an item the same everywhere; Valued as prices one Task, for an item whose worth depends on where it's claimed.

### GP gained
The sum of GP values of a Player's or Team's approved Submissions. Pending and rejected Submissions show their GP value to Moderators but don't count.

### Piece value
A site-wide rule, set by an Admin, that values an item piece as a share of its **Whole item**: the Whole item's price (times how many of it, usually 1), minus its **Other pieces**, divided by N.
- **Examples:** Bludgeon axon = Abyssal bludgeon ÷ 3. Ultor vestige = Ultor ring − Berserker ring − 3× Chromium ingot. Dizana's quiver = 4000× Sunfire splinters.
- **Other pieces:** The other items that go into the Whole item, each with a quantity, subtracted before dividing. Optional. Equal pieces covered by ÷ N (the bludgeon's other two pieces) are not listed as Other pieces.
- **Rules:** The Whole item and every Other piece must have a Grand Exchange price and can't themselves be a piece. One Piece value per piece; it overrides the piece's own price. When a Piece value works out to nothing (an Other piece has no price right now, or the result is zero or less) the Claim gets no GP value until it works out again. Adding or changing one prices only Claims that have no GP value yet.

### Pot
The total GP reward pool for a Bingo, computed from the per-player Buy-in amount plus an optional bonus pot contributed by the clan or sponsors.

### Buy-in
The entry fee in OSRS GP that each participating player must pay to join the Bingo, which contributes to the Pot.
