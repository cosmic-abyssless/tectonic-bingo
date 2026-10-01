# Domain Model: Tectonic Bingo

This glossary defines the shared language for the Tectonic Bingo platform. Every concept here has a single canonical name. Code, UI copy, and discussions must match these terms. Implementation details do not belong here.

---

## The Event

### Bingo
A single OSRS clan bingo competition, run from start to finish across a set of lifecycle stages.
- **Synonyms (tolerated, not canonical):** Event.
- **Rules:** Has its own board, rules, participants, teams, moderators, and pot. Scoped by a unique slug.
- **Not:** A tournament, a season.

### Historical Bingo
A past Bingo run on another website before this one, imported so its history lives here too. Always Finished and read-only, and marked **Historical** wherever it appears, so Players expect less detail.
- **Rules:** Holds only what the old site recorded: at least its dates, rules, Tiles (a picture each), Teams with their Captains and Players, final standings, and its Wise Old Man competition. Players are named by the RSN they played under then. Anything it never recorded (the Draft, signups, the audit log, Achievements, Wrapped, Rewind, Titles, Tile completion) is shown as not recorded, never as zero or empty.
- **Players:** A past Player is found by their Discord id, whether or not they have logged in here; one who has left the clan is still shown, but can't open the site. A Player whose Discord id isn't known appears only in the Wise Old Man leaderboard.

### Stage
The current lifecycle phase of a Bingo. Transitions move forward through a fixed sequence. The name in bold is the canonical one, used in UI copy, discussion and this glossary; the code value is engineering-only.
1. **Planning** (`planning`) — Admin configures board, tiles, rules, signup questions. Hidden from everyone but Moderators and Admins, and not listed.
2. **Signups open** (`signup`) — Players submit signups (solo or duo). Captains can already scout the signups.
3. **Signups closed** (`captains`) — The roster is final and signups are locked. Captains keep scouting until the draft starts.
4. **Draft** (`draft`) — Captains take turns picking players/duos in structured rounds. Every Player can watch; Cut signups are no longer Players from this stage on.
5. **Board revealed** (`reveal`) — Teams are set; the board is visible for prep, but submissions are not yet accepted.
6. **Live** (`live`) — The Bingo is running. Submissions are accepted and reviewed; points accumulate.
7. **Finished** (`complete`) — The Bingo has ended. Final scores are locked, winners declared.
- **Avoid:** "captains stage" in discussion or UI copy. It is the code value for Signups closed and reads as if it were about the Captain role.

### Codeword
A unique, secret text phrase generated for each Team in a Bingo that players must show in their verification screenshots (e.g. spoken in public chat, or in a clan chat message) to prove the screenshot was taken during this specific Bingo.
- **Who sees it:** A Player sees their own Team's, only while the Bingo is Live (any earlier would let a screenshot be staged before the start): beside the Board's title and in the Submit flow. Moderators see the Codeword of whichever Team they're submitting for or reviewing.

### Pre-load
A task or requirement that players are permitted to prepare before the Bingo goes `live` (or before a specific gate opens), without completing the final step. The usual case is pre-loading a chest: finishing a run before the Bingo starts and opening the chest once it's Live (common for the Corrupted Gauntlet).
- **Rules:** Must be explicitly enabled on the specific Part/Task (`allowsPreLoad`).
- **Not:** A screenshot. Pre-load has nothing to do with the Proof screenshot, which proves a starting state.

---

## Roles & Identity

### Owner
A Site Admin whose Discord id is listed in the server's `ADMIN_DISCORD_IDS`. The list is read live and never stored: taking an id off it leaves a plain Site Admin.
- **Capabilities:** Everything a Site Admin can, plus the Owner-only Actions: **Manage site admins** (grant and revoke site admin, from Site admin > Site admins) and **See everyone's Claude connections** (and revoke any of them).
- **Rules:** An Owner can't be revoked, by another Owner or themselves; only removing them from `ADMIN_DISCORD_IDS` makes them revocable. An Owner id that has never signed in is listed as "Not signed in yet" and becomes a Site Admin on first login. Revoking a Site Admin also ends all of their Claude connections.
- **Not:** A Bingo-level role. Owner exists only on the Site admin pages.

### Site Admin
A site-wide administrator with complete platform access, made one by an Owner (or by being an Owner).
- **Capabilities:** Can create, edit, and delete any Bingo; change site-wide settings; automatically acts as a Moderator on every Bingo. Sees who the Owners and Site Admins are, but can't grant or revoke site admin.
- **Not:** An in-game clan rank.

### Admin
The same people as Site Admins, named for what they do in a Bingo: create, configure and manage it.
- **Capabilities:** Create Bingos, manage signup questions, assign Captains and Moderators, transition stages, override scores.
- **Note:** "Site Admin" and "Admin" are one role (the `admin` role in the permissions model): Site Admin when talking about the Site admin pages, Admin inside a Bingo. Owner sits on top of it.

### Moderator
A trusted clan member whose elevated permissions are scoped to a single specific Bingo, granted by an Admin (or inherited by Site Admins).
- **Capabilities:** Review submissions (approve / reject), view all team boards, inspect audit logs, adjust team points manually.
- **Not:** Change the Bingo's stage or run the draft's pick order; those are for Admins. The stage read-out shows, without the buttons.
- **Rules:** A Moderator **can** also be a Player in the same Bingo, and **is permitted** to approve their own team's submissions, as they are trusted clan members.

### Staff
A member of the clan's leadership who handles a Bingo's Buy-ins, granted per Bingo like a Moderator.
- **Capabilities:** See and mark Buy-ins as received.
- **Not:** A Moderator. Staff see none of a Moderator's information, such as signup answers, other Teams or the audit log, beyond what they need for Buy-ins.
- **Avoid:** "Leadership" or "Leader" for the role. A Duo *leads* a Team.

### Captain
A designated player who leads a Team during a Bingo.
- **Capabilities:** Participates in the Draft to pick players/duos for their team; represents the team in disputes.
- **Team name:** A Captain (or co-captain) names their Team once the Draft has set it, while the Board is revealed. Live locks it, and from then on only Moderators and Admins can rename a Team, until Finished.
- **Rules:** Assigned by an Admin, from the signups as they come in, while signups are open or closed. Exactly one or two captains per team. In a duo Bingo a Team is led by a Duo: the Captain and their partner as co-captain, so an unpaired player is paired up before they can captain. The Draft can't begin while a Team isn't. A Duo that leads a Team stays one, and its players can't unpair or withdraw themselves; an Admin has to change the Team.

### Action
One named thing a user may do or see in a Bingo, such as marking Buy-ins, renaming a Team or reviewing Submissions. A role grants Actions, for some or all stages. A Restriction takes one away from one user.
- **Rules:** Rules that hold for everyone, Admins included (a Finished Bingo is locked), aren't Actions. They apply whatever a user is granted.

### Restriction
One Action taken away from one user in one Bingo, even when a role they hold grants it. It comes with a reason, lasts until lifted, and the user sees that the Action is restricted and why.
- **Rules:** Only Actions that do something (submitting, reacting, renaming a Team) can be restricted, never what a user can see, and never a Captain's Draft pick: a Captain who can't pick is replaced instead. Admins and Moderators apply them, a Moderator only to Captains and Players, and Admins can't be restricted. The restricted user and the Bingo's Moderators and Admins see a Restriction, and nobody else does.
- **Avoid:** "ban" for a Restriction. Removing someone from the Bingo is **Remove from Team**.

### Player
A clan member who is part of a Bingo as a competitor: until Board revealed, anyone with an active Signup, except Cut signups once the Draft stage begins; from Board revealed on, anyone on a Team. A withdrawn signup is never a Player.
- **Capabilities:** Sign up, view the board, make Submissions for their team, view team progress.
- **Rules:** Belongs to exactly one Team per Bingo once drafted. Anyone who isn't a Player, Moderator or Admin is "not part of this Bingo": they see only its name and stage, plus the signup form while Signups are open. Once the Bingo is Finished, every clan member can view it read-only.
- **Show screenshots once Finished:** A per-Bingo setting, on by default, that only Admins can change. Off, other Teams' screenshots are hidden from everyone but Moderators once the Bingo is Finished; the Submissions themselves stay visible, and a viewer's own Team's screenshots stay too.
- **Name:** Inside a Bingo a Player is named by the RSN they signed up with, not their Discord name (rosters, submissions, stats, the audit log, the draft, the header). The server puts it on `rsn` for every user it sends within a Bingo, and `playerName` prefers it. An account with no Signup in that Bingo, like a Moderator who isn't playing, falls back to the Discord name, as do site-level lists. A Discord name is only shown where it is labelled as one (the "Discord" columns of the roster and draft room, the profile subtitle). Audit entries written before this keep the names they were stored with.

---

## Signups & Drafting

### Signup
A player's registration for a specific Bingo, submitted during the `signup` stage.
- **Status:** Active or Withdrawn.
- **Rules:** Includes answers to custom signup questions set by the Admin (e.g. timezone, gear tier, OSRS RSN).
- **Question types:** Short text, long text, yes/no, **single choice** (radio buttons, one option) and **multiple choice** (checkboxes, any number of options). A multiple-choice answer is stored as a JSON list and shown as "Melee, Magic"; a required one needs at least one option ticked. A yes/no answer is shown as "Yes" or "No".
- **Member pick:** A question type whose answer is one or several clan members (for example "Who would you like to play with?"), picked by searching. The list is every clan member who has logged in, except the person answering, each named by the RSN of their latest Signup or else their Discord name. "Several" can carry a maximum. The answer is stored as the picked users, not their names, and shown by their current names in Bingo naming ("Zezima, Lynx Titan"). A pick stays, and keeps its name, even if that member later leaves the clan. One/several and the maximum are exported and imported with the Bingo.
  - **Avoid:** Player picker (the people picked needn't be Players).
- **Other option:** A single- or multiple-choice question can allow **Other**: an extra choice with a short free-text box (up to 100 characters), shown as "Melee, Other: hybrid". Other can't be picked without text, and a required question counts Other with text as answered. The setting is exported and imported with the Bingo.
- **Question helper text:** Each signup question can carry optional plain-text helper text (up to 500 characters), shown under it on the signup form. It is exported and imported with the Bingo.
- **Late signup:** A Signup an Admin makes on a player's behalf once Signups are closed, for someone joining late. It is a real Signup (an RSN, a buy-in to collect, unanswered questions), made from Signups closed until the Bingo is Finished. Players can only sign themselves up while Signups are open.

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
- **Share:** What every Team drafts under the setting, e.g. "1 pair and 1 single". A Team that has its share of pairs can't take another pair (likewise singles). In a duo Bingo the pairs come first (see Draft).
- **Avoidable cut:** A Player who is cut as things stand but wouldn't be if the changes a Cut review proposes were made.
- **Unavoidable cut:** A Player who would still be cut after every change a Cut review can propose. The cut warnings count only these; while any cut is avoidable they say "Some cuts can be avoided" and point to the Cut review.

### Cut review
A plan for cutting as few Players as possible before the Draft, which an admin looks over, edits and applies.
- **Changes it proposes,** in order of preference: pair two singles (same timezone region first, then by signup date), split a pair (never one a Captain belongs to), and add or remove one Team (never below a minimum Team size, which grows with the number of Players). It never switches the Draft cuts setting.
- **Rules:** Run by Admins. The admin sees the whole plan and can edit it before applying, e.g. pair people differently from what's proposed, since they know the players. The players don't get a say: an admin's change applies straight away, like pairing singles by hand. While any cut is avoidable, moving into the Draft stage goes through a Cut review first; dropping every proposed change is a deliberate way through.
- **Not:** Switching to "No cuts". That removes cuts by definition, it doesn't minimise them.

### Draft
The structured selection process during the `draft` stage where Captains take turns selecting Players (or Duos) onto their Teams.
- **Mechanics:** Snake draft or linear, divided into rounds.
- **Pairs first:** In a duo Bingo, a Team can't draft a single while there's still a pair it may take: once every pair is drafted (or the Team has its share of pairs), singles open. Every Team gets one pick a round, so with pairs first they all reach their share together. It holds for Admins picking for a Team too.

- **Draft room:** The page where the Draft happens. Captains and Moderators enter it once signups are open; every Player can watch once the Draft stage begins (Cut signups can't).
- **On the clock:** The Team whose Captain is picking now. Shown to everyone as who is currently picking, with the round and pick number; the Captain on the clock also gets a stronger cue that it is their turn. There is no pick timer.

### Scouting
Looking through the signups before the Draft. Captains (and Moderators) can scout from Signups open; every Player can once Signups are closed, when the roster is final.
- **Rules:** Players only look: they don't see signup answers, and only a Team's Captains rate and note players (Pick Ratings, private to that Team).

### Pick Rating
A Team's private note on a signup while scouting: 1 to 3 stars and a short note.
- **Rules:** Written by the Team's Captains only, shared between them, and carried into the Draft. Rating either half of a Duo rates both. Never shown to other Teams.

### Team
The group of Players a Captain leads, formed by the Draft. Has a name, a color, and one or two Captains.
- **Rules:** Once the Draft has set the Teams, an Admin can still change them for what nobody planned for: **Remove from Team** (a Player who has to leave, for an emergency or a ban; an optional reason goes in the audit log) and a Late signup. A removed Player's Signup is Withdrawn, so they are no longer a Player, but their Submissions and points stay with the Team, still credited to them. They keep their place in the Stats, Titles and Wrapped for what they did, and are told they were removed. A Captain or co-captain can only be removed by naming another Player on the Team to take that role. Once the Bingo is Finished its Teams and signups are locked; an Admin who has to fix something moves it back to Live first.
- **Not:** A ban with its own consequences. Voiding a removed Player's drops is done Submission by Submission, through review.

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

### Sealed Tiles
A per-Bingo option under which, during Board revealed, Players and Captains see each Tile's art, name and Category but can't open it. Its Parts, Tasks, Items and points stay hidden until an Admin unseals the Tiles or the Bingo goes Live.
- **Rules:** Moderators and Admins can always open Tiles. No Task interest can be marked while sealed. Exclusive Item lists are hidden while sealed, because they name Items. Whether the rules text is visible is a separate option.
- **Avoid:** "locked Tiles". "Locked" already means a Task blocked by its conditions, and a Tile in its Freeze Period.
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
  - `COUNT` — "Complete at least N of" (e.g., any 2 out of 5). Over Items only it reads "N of any (no dupes)": each Item is done at one drop, so the same item twice still counts once.
  - `SUM` — "N of any (dupes count)" (e.g., 500 total kill count or secondary ingredients): every drop adds to the total, the same item again included. An Item in it can count as more than one (see Counts as).
- **Leaves:**
  - `ITEM` — An in-game item drop, tracked by OSRS item name and quantity.
  - `MANUAL` — An objective manually judged/verified by a Moderator.

### Counts as
How much one of an Item adds to the total of the SUM ("N of any (dupes count)") it's in, when it's worth more than one of what's being totalled.
- **Rules:** A whole number from 1; 1 unless set. It only matters inside a SUM: in ALL, ANY or COUNT, or as a Task on its own, an Item is done at one, whatever it counts as. The Submit flow still asks for the real number of items, and the SUM's progress counts each of them as that many. An Item shared by two parents counts as the same everywhere. Drop value, Stats and Achievements use the real quantity. Shown to Players next to the Item when it isn't 1 ("Pyromancer garb · counts as 25").
- **Example:** Wintertodt's "200 burnt pages" is a SUM reading "200 of any (dupes count)" over Burnt page (counts as 1) and the Pyromancer pieces, Bruma torch and Tome of fire (each counts as 25). One Pyromancer garb is submitted as 1 and adds 25 to the 200.
- **Not:** A Drop value or Valued as. Counts as changes how far a drop moves a Task, never what it's worth in GP.

### Category
A grouping label applied to Tiles (or rows/columns) to organize the Board thematically (e.g. "PvM", "Skilling", "Minigames", "Wilderness").

### Line
A completed sequence of Tiles across the Board (row, column, diagonal, or custom line) that awards bonus points when every Tile in the sequence is completed.

### Freeze Period
A delay configured on a Tile: for its duration after the Bingo starts, no Team can submit to that Tile.
- **Rules:** It runs from the moment the Bingo counts as started, once, for every Team. It isn't tied to any Team completing the Tile.

### Tutorial
A short, skippable walk through the Board for a Player: their Team, opening a Tile, what it needs, Task interest, Submitting, and the ☰ menu.
- **When:** Once per account, the first time a Player sees their own Team's Board in a Live Bingo. Finishing or skipping it counts as seen, on every device. Anyone can replay it from the ☰ menu; replaying never changes that.
- **Who:** Players, on their own Team's Board. Not a Moderator or Admin looking at a Board they don't play on.
- **Steps:** Some wait for the Player to click the real thing (open a Tile, open Submit, open the ☰ menu), which then opens as usual; the rest only point things out. Nothing is ever Submitted: the Tutorial shows the Submit flow's inputs and every way into it, then closes it itself. Only those opens are asked for: marking Task interest and the ☰ menu's entries are shown, never required, so an Achievement they lead to stays a reward for choosing to. What's opened during the Tutorial counts like any other open.
- **Avoid:** Tour, onboarding.

---

## Submissions & Scoring

### Submission
A single proof package submitted by a player on behalf of their Team to claim completion of one or more Tasks on a Tile.
- **Composition:** Contains one or more Screenshots and associated Claims.
- **Kinds:** A drop (the usual kind, with its Claims) or a **Proof screenshot** (no Claims; see Proof screenshot). Both are posted and reviewed the same way.
- **Status:** `pending` → `approved` | `rejected`.
- **Reviewer:** Must be reviewed by a Moderator (or Admin/Site Admin).
- **Feedback:** Rejections must include reviewer notes so the team knows what went wrong.
- **Whose drop / who posted:** A Submission belongs to the Player who got the drop (`submittedBy`: credited on the board, in the stats and in the mod queue). When someone else uploaded it, that Player is recorded as the poster (`postedBy`, shown as "posted by"), and the audit entry has them acting on behalf of the Player. This is the usual case of a teammate at a PC posting a drop from mobile.
- **Who may post for whom:** A Player posts to their own Team, for themselves or any teammate. A Moderator (or Admin) may also submit to any Team of the Bingo while viewing it, and must say which of its Players the drop belongs to. The Bingo must be live either way.
- **Changing the credit:** A Moderator can move a Submission's credit to another Player of its Team ("Change player" in the mod queue), in any state, when the poster forgot to pick who it was for. The credit moves; the review, the points and the Team don't. The original uploader stays as the poster, and the change is recorded in the audit log.

### Reaction
An emoji a Player leaves on a Submission of their own Team, from a fixed set of five (🔥 🎉 😂 💀 👀).
- **Rules:** Only members of the Submission's Team can react, to a Submission in any status (their own included), until the Bingo is Finished: then Reactions are closed, and none can be added or taken back. Each Player can leave each emoji once per Submission, and can take it back. Seen by the Team and Moderators only, except in Rewind, which shows them to everyone once the Bingo is Finished.

### Screenshot
An image attached to a Submission proving in-game completion.
- **Types:** Main drop screenshot, bank screenshot, collection log screenshot, other.
- **Verification:** Scanned for the Bingo's Codeword and item name via OCR/text-matching; verified by a human Moderator during review.

### Proof screenshot
A screenshot of a Tile's starting state that a Player posts before their drops on that Tile count, such as an empty supply cart at Wintertodt, an empty pool at Tempoross or an empty rift at Guardians of the Rift. It proves the loot that follows was earned during the Bingo, not carried in.
- **Rules:**
  - **Where required:** an Admin requires one on a whole Tile or on individual Tasks (a Tile mixing Wintertodt and Tempoross needs a different one per Task), never both on the same Tile. The requirement can carry a note on what to show.
  - **What it is:** a kind of Submission. It's posted through the same Submit flow (for yourself or a teammate) and only while the Bingo is Live, and reviewed in the same queue (approved or rejected, with the usual Codeword check).
  - **How long it counts:** each Player needs their own, once per requirement for the whole Bingo, and any approved one counts.
  - **Missing ones:** a drop without an approved Proof screenshot from its Player can still be submitted, but it's flagged in review, and so is a drop submitted before the Proof screenshot.
  - **Not a drop:** it has no Claims or points, and isn't counted in Stats, Titles, drop value, Rewind, Wrapped or Achievements. It can't be reacted to.
- **Not:** A Submission's drop screenshot (which proves the drop itself), and not Pre-load.

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
- **Rules:** Each award (a Task, Part or Tile bonus) is split between the Players whose approved Claims were on the path that completed it, weighted by quantity: ALL counts every child, ANY the first child to complete, COUNT N the first N, SUM N and item quantities (each times what its Item counts as) in approval order, capped at what was still needed. Claims approved after the award, or on branches that didn't decide it, earn nothing. A Tile bonus, and each Tile's equal part of a Line bonus, go to Players by their share of that Tile. Point Adjustments are left out. Shown to two decimal places.
- **Not:** A count of Submissions. Many easy Claims don't beat one Claim that completed a raid Part.

### Stats
The Bingo's stats page: points over time, each Player's Points share over time (the top five and you, to start), the timeline, top contributors (ranked by Points share) and tile completion.
- **Rules:** Moderators see every Team at every stage. While the Bingo is Live a Player sees only their own Team; once it is Finished everyone sees every Team. "First to complete" events are shown to Moderators throughout and to Players only once the Bingo is Finished.

### Title
A tongue-in-cheek label a Player holds on the Stats page for how they played ("Carry", "Closer", "Butterfingers"), recomputed as the stats change.
- **Rules:** Each Title goes to the Player with the best value among the Players shown, once they meet its minimum. A Title is never shared: a tie goes to the tied Player holding the fewest Titles, then to whoever reached that value first. With a Team selected in the team filter it's that Team's; unfiltered, the Bingo's. Titles follow the Stats visibility rules. The contributors table shows a chip for every Title a Player holds, in priority order, and their profile lists them with the number behind each. Some Titles use their Wise Old Man gains during the Bingo (EHB, boss kill counts), read from what Wise Old Man already has (never an update request), so they lag until the Player updates, and they freeze once the Bingo is Finished. A Site admin can turn Titles off and tune each one's minimum (and the luck Titles' floors) from Site admin > Titles; a change applies straight away to every Bingo that isn't Finished. A Finished Bingo keeps the settings, and the set of Titles, it finished with, so later tuning or a new Title doesn't reach it; it gets a fresh copy if it's reopened and finished again.
- **Not:** A permanent award. Titles belong to one Bingo and move as it goes, and can still move after it's Finished when a Submission is reviewed late.

### Hidden Title
A Title nobody knows exists until someone holds it: it shows up only then, marked as a hidden Title unlocked, and there's no hint of it before.

### Luck
How unlikely a drop, or a dry streak, was: "1 in N". Judged against the Item's real drop rate and the kills the Player gained at its bosses during the Bingo, as counted by Wise Old Man.
- **Rules:** A drop is judged over the kills since the Player's previous drop of the same Item (or the Bingo's start), up to the drop, so grinding on afterwards doesn't lessen it. The kills are never understated: a count missing from Wise Old Man makes a drop look less lucky, never more. A dry streak is judged against every Item on the Board the boss drops, and ends at the Player's last drop of one of them. Only Items from bosses Wise Old Man counts have luck (not Slayer monsters, minigames or skilling). A raid counts one completion as one kill, at a typical run's rates. The luck Titles need at least 1 in 10: Spoon over a Player's drops (the luckiest in full, each further one counting half as much as the one before), Dry over a streak, and Clutch on the drop itself, before its Drop value weighs in.
- **Not:** Points share, or Drop value. A 1-in-1,000 pet is very lucky and worth nothing.

### Useful drop
A drop that still moved its Task forward when it came, judged by the Items that were still open on the Task (the last missing piece of a set is rarer than the first, when any of them would do).
- **Rules:** A drop that earned no Points share is not useful. When it earned Points share on both a Task and the Part around it, it's judged on the outermost one, where the most Items could still have helped.

### Drop value
What a Claim's drop is worth in GP (gold pieces, the game's currency): the item's Grand Exchange price times its quantity, fixed when the Submission is made.
- **Rules:** Priced at the midpoint of the item's latest buy and sell prices. A charged item that isn't sold on the Grand Exchange is priced as its uncharged version (Craw's bow as Craw's bow (u), Tumeken's shadow as its (uncharged) version). It may arrive shortly after the Submission is made and is never changed once set. A Historical Bingo's Claims keep the Drop values its import brings, priced at the time; one it doesn't bring is priced at today's prices. A Claim with no item (a MANUAL task), or an item with no Grand Exchange price and no Piece value (e.g. a pet), has no Drop value, shown as "—".
- **Not:** A scoring source. Drop value never earns or costs points.
- **Avoid:** GP value.
- **Re-price:** A Moderator can price a Submission's Claims again, when a value is wrong because it was priced from the wrong thing (before its Task got a Valued as, or before its item had a Piece value). Not for bringing values up to today's prices. A Claim that can't be priced right now keeps its value. Recorded in the audit log.
- **Re-pricing a Task:** Changing a Task's Valued as once Submissions have a Drop value from it asks whether to re-price them too (only that Task's Claims, at today's prices) or leave them and apply it to new Submissions only.

### Valued as
An optional setting on an item Task: Claims on that Task get their Drop value from another item ÷ N instead of their own item's price.
- **Example:** On a DT2 boss's page, the Gold ring Task is valued as that boss's vestige ÷ 3. A gold ring is an ordinary tradeable item (~160 GP), but from these bosses it counts as a third of the vestige, and which vestige depends on the boss. The page's vestige Task is valued the same way (its own vestige ÷ 3), so on that tile a vestige counts like a ring roll, while its Piece value (the whole vestige) still applies everywhere else.
- **Source:** An optional short name for where these Claims come from ("Vardorvis"), shown dimmed next to the item wherever its Drop value is listed, with the valuation on hover, so players see why an ordinary-looking item is worth so much. Without a Source, the valuation itself is shown.
- **Rules:** Set per Task in the board editor, saved with the board (exported and imported with the Bingo). The named item is priced like any other, including its Piece value. One value per Task, so a Task that could be claimed from several sources worth different amounts has to be split into one Task per source (issue #189).
- **Not:** A Piece value. A Piece value prices an item the same everywhere; Valued as prices one Task, for an item whose worth depends on where it's claimed.

### Total drop value
The sum of the Drop values of a Player's or Team's approved Submissions: what the drops they brought in were worth, not what they kept (much of it is split with teammates or goes into the Pot). Pending and rejected Submissions show their Drop value to Moderators but don't count.
- **Synonyms (tolerated, not canonical):** GP gained.
- **Rules:** Where the label already reads as a total (a stat tile, a share card), it may say just "Drop value".

### Piece value
A site-wide rule, set by an Admin, that values an item piece as a share of its **Whole item**: the Whole item's price (times how many of it, usually 1), minus its **Other pieces**, divided by N.
- **Examples:** Bludgeon axon = Abyssal bludgeon ÷ 3. Ultor vestige = Ultor ring − Berserker ring − 3× Chromium ingot. Dizana's quiver = 4000× Sunfire splinters.
- **Other pieces:** The other items that go into the Whole item, each with a quantity, subtracted before dividing. Optional. Equal pieces covered by ÷ N (the bludgeon's other two pieces) are not listed as Other pieces.
- **Rules:** The Whole item and every Other piece must have a Grand Exchange price and can't themselves be a piece. One Piece value per piece; it overrides the piece's own price. When a Piece value works out to nothing (an Other piece has no price right now, or the result is zero or less) the Claim gets no Drop value until it works out again. Adding or changing one prices only Claims that have no Drop value yet.

### Pot
The total GP reward pool for a Bingo, computed from the per-player Buy-in amount plus an optional bonus pot contributed by the clan or sponsors.

### Buy-in
The entry fee in OSRS GP that each participating player must pay to join the Bingo, which contributes to the Pot.

---

## Achievements

### Achievement
A just-for-fun milestone a Player earns during a Bingo, e.g. "Strong start: submit your first drop". Never affects points, scoring or the Board.
- **Scope:** Per Bingo: every Bingo starts everyone from nothing. Only Players on a Team earn them (a Moderator who isn't playing never does), and only while the Bingo is Live.
- **Who earns it:** The Player who did the thing, through the app, so the unlock plays on their own device. Posting a teammate's drop earns the poster "Strong start", not the teammate the drop is credited to. Two kinds are exceptions, and their popups wait for the Player: one for what teammates do to your drop (Reactions on it) goes to the Player the Submission is credited to, and one for in-game play (a clue casket opened, hours bossed or played, bosses killed during the Bingo) is noticed from the Player's Wise Old Man snapshots, so it only arrives once Wise Old Man has an updated snapshot of them. That play counts only from 6 hours after the Bingo starts (or after the Achievement is switched on, if later): the hiscores only update when a player logs out and no session lasts longer than 6 hours, so earlier snapshots can still hold play from before the Bingo. Titles and Luck still count from the start, like the Wise Old Man competition.
- **Rules:** Earned the moment its condition is met, and never revisited: not taken away if the Submission behind it is rejected or a Reaction is taken back, and never awarded after the fact by a correction someone else makes. Every Bingo offers the same Achievements; an Admin can switch individual ones, or all of them, off for a Bingo (switching off only hides them). An Achievement added to the catalogue later reaches a Bingo already under way only if an Admin switches it on there, and is earned from then on, never from earlier play.
- **Visibility:** Not secret, just not shown off: the Player sees their own list, other Players see at most their count ("5 / 16"), and Moderators can see earns in the audit log. Unearned ones show greyed out; a **Hidden** Achievement shows as a "???" slot until earned, so there's something to discover by playing around.
- **Unlock:** Announced once, on the Player's own device, with a popup in the style of OSRS's combat achievement and collection log popups (icon, title, the description of how it's earned and a line of **flavour text**). The Player's list of Achievements shows the description, and the flavour text only once earned. If they weren't there to see it, it plays next time they open the Bingo; several queue one after another.
- **Time of day:** Achievements about the time of day ("Night owl") go by the Player's own device clock, and must be earnable on any day of the Bingo, not only at its start or end.
- **Should work for anyone:** Every Achievement must be earnable, in theory, by any Player. A one-off honour ("first Submission of the Bingo") or a ranking ("most Achievements") is a Title, not an Achievement.
- **Avoid:** Badge, Trophy, Medal.
- **Not:** Combat Achievements (the in-game OSRS ones shown in a Player's clan standing), nor the clan's own honours shown beside a Player's name (Maxed, Grandmaster, Gilded log).

### Superlative
An award within a Team, voted by its Players, e.g. "Team MVP", "Team Spirit", "The Grinder".
- **Rules:** Each Team votes on its own members and gets its own winners. The categories are set per Bingo by an Admin. Only Players on the Team vote, never for themselves; Duo partners and Captains can be voted for like anyone else. Votes are secret: nobody, Moderators and Admins included, sees who voted for whom.
- **Voting:** Open for the whole of Live, closing when the Bingo is Finished. A Player picks one teammate per category, can skip a category, and can change their votes until voting closes, so the votes can follow how the Bingo goes. Players added to the Team mid-Live can vote and be voted for from then on; a Player removed from it loses their votes and the votes cast for them. The categories can be added, renamed or deleted at any time, up to 3 per Bingo so every one fits on the Team's share card; renaming keeps the votes, deleting removes them. A Bingo with no categories has no Superlatives.
- **Results:** Only the winners are shown, never vote counts or runners-up; Admins alone can see the counts, once voting has closed. **Turnout** (how many of each Team's Players have voted, in any, every and each category) is Admin-only too but visible at any time, live, since it says nothing about who voted or for whom. A tie is shared by everyone tied; a category with no votes has no winner. Hidden from everyone until Wrapped is published, then revealed there: a Player's Team section shows their Team's Superlatives, and the Bingo-wide part lists every Team's winners.
- **Not:** A Title. Titles are computed from stats; Superlatives are voted.

---

## Recap

### Bingo Recap
The look back at a Finished Bingo, in the spirit of a year-in-review: a family of features (Rewind first) that retell how the Bingo went.
- **Rules:** Only for Finished Bingos, and open to everyone who can see the Bingo.

### Rewind
Playback of a Finished Bingo on its own Board: a timeline of its Submissions that the Board, the scoreboard and popups of the drops follow as it plays or is scrubbed.
- **Clock:** Submission time (when the drop was posted), not approval time, so a batch of approvals doesn't clump drops together. Its scoreboard can therefore differ mid-way from the Stats points chart, which goes by approval; the end totals agree.
- **Rules:** Only approved Submissions move the Board and the scoreboard. Rejected ones can be shown, off by default, stamped "Rejected", and never change anything. Point Adjustments count from when they were made.
- **All Teams:** A Rewind view of every Team at once: the shared Board, each Tile marked with every Team that has completed it by then, and every Team's Submissions on the timeline (coloured by Team) and in the popups.
- **Speed:** Play runs at 1x, 2x, 4x or 8x, remembered per viewer across Bingos. From 4x it skips minor Submissions (they still count on the Board and the timeline); notable and huge ones always play. Stepping and scrubbing ignore it.
- **Log:** Every Submission up to the moment being viewed, newest first, minor ones included (even those a fast speed skips), so none goes unseen. Opening one jumps there and shows its popup, whatever its tier.
- **Closing card:** At the very end (Play running out, or a scrub or step there), the final Titles with their holders, as the Stats page shows them for the viewed Team, or for the whole Bingo in the All Teams view. Titles aren't replayed along the way.
- **Not:** The Stats timeline, which lists scoring events by approval time.

### Significance
How much a Submission stands out in Rewind, from its Luck, Drop value, Reactions, and what it completed (a Tile, a Line, a first to complete). Missing signals are left out, not counted as zero, so a very lucky pet with no Drop value can still stand out.
- **Tiers:** minor (its Tile only flashes during Play), notable (a small popup) and huge (a big popup that holds longer). Every tier is listed in Rewind's log.

### Wrapped
A scrolling story of a Finished Bingo, told from one Player's point of view: You, then your Duo and your Team, then the Bingo as a whole. It ends in shareable cards to compare with others.
- **Audience:** Every Player gets their own. Anyone else who can view the Finished Bingo (e.g. a Moderator who didn't play) gets only the Bingo-wide part. A Captain also gets a section on their Draft, and a Moderator on their reviews.
- **Publishing:** Hidden until a Moderator publishes it, which leaves time for the wrap-up with the Players. Refused while any Submission is pending, so it's never missing drops still in the review queue. A Bingo can be set to publish it on its own once it is Finished and nothing is pending (off by default). Publishing fixes its numbers: they don't change afterwards unless a Moderator publishes it again.
- **Wrapped art:** Decorative in-game character cut-outs, drawn as stickers on torn paper. They don't represent the Players; they just suit the story. **Category images** are any number per section, side by side above its heading (a Team's three, a Duo's two); **side images** are one pool, shown large beside the sections in turn on wide screens. **Player card art** is a ranked pool for the Player card, best first: the Players who get a Player card are split by Points share rank in the Bingo into as many equal bands as there are images, and each gets their band's image (the top band the first). Admins upload them per Bingo, one character per image, as a transparent PNG or a screenshot on one solid colour (keyed out on upload), and a new Bingo starts with a copy of the previous Bingo's. Unlike the numbers, publishing doesn't fix them.
- **Credits:** People an Admin names in Wrapped (board design, art, moderating and so on), each a name with an optional role. Free text, independent of who holds the Admin or Moderator role. A credit either belongs to one Category image, its name captioned on the art in OSRS's in-game font, or is one of a category's **additional credits** (no image), listed in order under that category's images. Every category works the same way; the **Moderators** category (distinct from a Moderator's own section) credits who moderated the Bingo in The Bingo's "Behind the scenes". A Moderator's own section captions its middle image with their name instead. Exported with the art and copied to a new Bingo with it; like the art, publishing doesn't fix them.
- **Share cards:** Images at the end of Wrapped to share and compare (portrait 4:5, 1080×1350), each with Copy image, Download and, where the browser can share files, Share. A Player gets two: the **Player card** (their Points share and its percentage of the Team's points, its rank on their Team and in the Bingo, Drop value, approved Submissions against the Bingo average, Achievements earned, EHB gained, up to 3 Titles, their pick and its round (or "Captain"), their top drop and luckiest drop, their driest streak) and the **Team card** (placement, points, Tiles and lines, Drop value, the MVP, up to 3 Superlatives, the biggest drop). A theme can decorate them with Wrapped art: the Player card with the Player's Player card art, the Team card with the Team section's first 3 Category images; with none uploaded, the card falls back to its section's first Category image, else a side image. Anyone else gets none. Their contents are fixed: a Player can't choose what goes on one, and a field or card with nothing to show is left out. Drops show their item's icon, never a screenshot, and GP always has the coins icon. Made only in the viewer's browser, never on the server. In a Moderator's preview every card is watermarked "Preview".
- **MVP:** The Player with the highest Points share on a Team. Computed, never voted. **Not:** a Superlative, even one a Team names "Team MVP", nor a Title.
- **Avoid:** Recap for this feature alone (Recap is the family it belongs to).

### Steal
A Draft pick who finished far higher in Points share than their pick number suggested: a late pick near the top. A Duo counts as one pick.
- **Rules:** Wrapped names steals, never the opposite: an early pick who scored low is not singled out.
- **Title:** The Overperformer Title goes to the Player who beat their draft position by the most, which is the Bingo's biggest Steal among eligible Players. In a Duo, only the higher scorer can hold it.
