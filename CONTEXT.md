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
The current lifecycle phase of a Bingo. Transitions move forward through a fixed sequence:
1. `planning` — Admin configures board, tiles, rules, signup questions. Hidden from normal players.
2. `signup` — Players submit signups (solo or duo). Admins review and approve.
3. `captains` — Captains are assigned; signups are locked.
4. `draft` — Captains take turns picking players/duos in structured rounds.
5. `reveal` — Teams are set; the board is visible for prep, but submissions are not yet accepted.
6. `live` — The Bingo is running. Submissions are accepted and reviewed; points accumulate.
7. `complete` — The Bingo has ended. Final scores are locked, winners declared.

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
- **Rules:** A Moderator **can** also be a Player in the same Bingo, and **is permitted** to approve their own team's submissions, as they are trusted clan members.

### Captain
A designated player who leads a Team during a Bingo.
- **Capabilities:** Participates in the Draft to pick players/duos for their team; represents the team in disputes.
- **Rules:** Assigned by an Admin during the `captains` stage. Exactly one or two captains per team.

### Player
Any clan member participating in a Bingo as a competitor.
- **Capabilities:** Sign up, view the board, make Submissions for their team, view team progress.
- **Rules:** Belongs to exactly one Team per Bingo once drafted.

---

## Signups & Drafting

### Signup
A player's registration for a specific Bingo, submitted during the `signup` stage.
- **Status:** Active or Withdrawn.
- **Rules:** Includes answers to custom signup questions set by the Admin (e.g. timezone, gear tier, OSRS RSN).

### Duo
Two players who register to enter the Bingo together and must be drafted onto the same team as a single unit.
- **Synonyms:** Pair (acceptable synonym), Pairing (internal record).
- **Rules:** Both players must confirm the pairing. Consumes a single pick in a duo-draft round.

### Leftover
A player or duo that remains when total signups do not divide evenly into teams.
- **Leftover Modes:**
  - `cut` — Leftover players are excluded from the draft and cannot participate.
  - `singles` — Leftover players enter the draft as solo picks in a dedicated **Singles Round** at the end of the draft.

### Singles Round
The final phase of a draft when `leftoverMode` is set to `singles`, in which odd leftover players are picked individually after regular team rounds.

### Draft
The structured selection process during the `draft` stage where Captains take turns selecting Players (or Duos) onto their Teams.
- **Mechanics:** Snake draft or linear, divided into rounds.

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

### Point Adjustment
A manual grant or deduction of points applied to a Team by a Moderator or Admin, with a required written reason, outside regular Tile completions.

### Pot
The total GP reward pool for a Bingo, computed from the per-player Buy-in amount plus an optional bonus pot contributed by the clan or sponsors.

### Buy-in
The entry fee in OSRS GP that each participating player must pay to join the Bingo, which contributes to the Pot.
