# Tectonic Bingo — Data Model Proposal

## Overview

This document proposes a PostgreSQL relational data model for the Tectonic Bingo tracker. The board is a **7×7 grid** with 49 tiles across 7 badge categories. Every tile has a **Part A** and **Part B**, each with its own point value and set of requirements. Teams track progress independently, submissions require moderator approval, and lines award bonus points.

---

## Entity Summary

| Entity | Purpose |
|---|---|
| `users` | Discord-authenticated accounts |
| `bingo_events` | A single bingo event instance |
| `event_moderators` | Users with mod privileges for an event |
| `teams` | A competing team in an event |
| `team_members` | Players assigned to a team |
| `tiles` | The 49 board tiles |
| `tile_sides` | Part A and Part B of each tile |
| `tile_side_items` | The individual items/tasks required for a side |
| `tile_wildcards` | Wildcard items available per tile |
| `team_tile_progress` | A team's current completion state per tile |
| `submissions` | A player's claim that a tile side is complete |
| `submission_screenshots` | Screenshot evidence attached to a submission |
| `submission_item_claims` | Specific items claimed within a submission |
| `team_wildcard_usage` | Tracks wildcard redemptions per team |
| `bingo_lines` | The 16 possible lines on a 7×7 board |
| `bingo_line_tiles` | Which tiles belong to each line |
| `team_completed_lines` | Lines a team has completed |
| `team_point_adjustments` | Manual bonuses or penalties (e.g. -100 for hiding in CC) |

---

## Schema

### `users`
Discord SSO is the authentication method. One user = one Discord account.

```sql
users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id       varchar(32)  UNIQUE NOT NULL,
  discord_username varchar(64)  NOT NULL,
  discord_avatar   varchar(256),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
)
```

---

### `bingo_events`
Represents a single bingo event run. Designed so historical events are preserved.

```sql
bingo_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(128) NOT NULL,        -- "Who's That Pokémon!? A Tectonic Bingo"
  starts_at   timestamptz  NOT NULL,
  ends_at     timestamptz  NOT NULL,
  pot_amount  bigint,                       -- GP value, nullable until confirmed
  is_active   boolean      NOT NULL DEFAULT false,
  created_at  timestamptz  NOT NULL DEFAULT now()
)
```

---

### `event_moderators`
Users granted moderator permissions for a specific event.

```sql
event_moderators (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bingo_event_id  uuid NOT NULL REFERENCES bingo_events(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bingo_event_id, user_id)
)
```

---

### `teams`
Each team has a unique codeword used to verify submissions belong to the correct team.

```sql
teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bingo_event_id  uuid         NOT NULL REFERENCES bingo_events(id),
  name            varchar(64)  NOT NULL,
  codeword        varchar(32)  NOT NULL,
  color           varchar(16),             -- hex code for UI display
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (bingo_event_id, codeword)
)
```

---

### `team_members`
Links a user to a team for a given event. Tracks their RSN for that bingo.

```sql
team_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES teams(id),
  user_id      uuid        NOT NULL REFERENCES users(id),
  rsn          varchar(12) NOT NULL,        -- RuneScape display name (max 12 chars)
  is_captain   boolean     NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
)
```

---

### `tiles`
The 49 bingo tiles. `board_row` and `board_col` define position on the 7×7 grid (0-indexed). Badge categories correspond to the visual groupings on the board.

```sql
CREATE TYPE badge_category AS ENUM (
  'demonic', 'draconic', 'spectral', 'animalistic',
  'god_wars', 'vampyric', 'desert'
);

tiles (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  bingo_event_id          uuid           NOT NULL REFERENCES bingo_events(id),
  name                    varchar(64)    NOT NULL,    -- e.g. "DOOM OF MOKHAIOTL"
  badge_category          badge_category NOT NULL,
  board_row               smallint       NOT NULL CHECK (board_row BETWEEN 0 AND 6),
  board_col               smallint       NOT NULL CHECK (board_col BETWEEN 0 AND 6),
  total_points            int            NOT NULL,
  has_freeze_period       boolean        NOT NULL DEFAULT false,
  freeze_duration_minutes int            NOT NULL DEFAULT 0, -- 120 for raids/colosseum/doom
  notes                   text,
  created_at              timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (bingo_event_id, board_row, board_col)
)
```

**Tiles with freeze periods:** COX 1, COX 2, TOB 1, TOB 2, TOA 1, TOA 2, Colosseum, Doom of Mokhaiotl (all 120 minutes).

---

### `tile_sides`
Part A and Part B for each tile. Part B points are only awarded after Part A is completed.

```sql
CREATE TYPE tile_side AS ENUM ('A', 'B');

tile_sides (
  id                         uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id                    uuid      NOT NULL REFERENCES tiles(id),
  side                       tile_side NOT NULL,
  points                     int       NOT NULL,
  description                text      NOT NULL,    -- full challenge description
  requires_no_duplicates     boolean   NOT NULL DEFAULT false,
  allows_previously_acquired boolean   NOT NULL DEFAULT false, -- e.g. Cerberus, Zulrah
  allows_pre_load            boolean   NOT NULL DEFAULT false, -- e.g. Barrows, Moons chest
  notes                      text,
  UNIQUE (tile_id, side)
)
```

---

### `tile_side_items`
The individual items or tasks that make up a tile side's requirement. The `options_group` field is used when the requirement is "choose X from this list" — items in the same group are treated as alternatives.

```sql
tile_side_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_side_id    uuid        NOT NULL REFERENCES tile_sides(id),
  item_name       varchar(128) NOT NULL,
  quantity        int         NOT NULL DEFAULT 1,
  options_group   varchar(32),   -- items sharing a group are interchangeable alternatives
  sort_order      int         NOT NULL DEFAULT 0
)
```

**Example — Cerberus Part B:**
All four crystals each get an entry with `options_group = NULL` because all are required.

**Example — Demonic Gorillas Part B:**
"Obtain a heavy frame OR a monkey tail" — both items share `options_group = 'part_b_choice'` and `quantity = 1`.

---

### `tile_wildcards`
Wildcard items (usually the boss jar or a special drop) that can substitute for a required item. Scoped per tile, with a max redemption cap per team.

```sql
tile_wildcards (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id                   uuid        NOT NULL REFERENCES tiles(id),
  item_name                 varchar(128) NOT NULL,  -- e.g. "Cerberus jar"
  max_redemptions_per_team  int         NOT NULL DEFAULT 1,
  description               text,
  applicable_to_side        tile_side   -- NULL = either side
)
```

**Examples:**
- Cerberus jar → wildcard for any Cerberus unique (1x)
- Scythe of Vitur → wildcard for a Justi piece on TOB 1 (1x), but a single Scythe cannot be used for both TOB 1 and TOB 2
- Shadow → wildcard for any TOA item on TOA 1 or TOA 2 (1x each)

---

### `team_tile_progress`
Aggregated status for a team on each tile. Updated whenever a submission is approved. The `side_b_points_awarded` remains 0 until Part A is also completed.

```sql
CREATE TYPE tile_status AS ENUM ('not_started', 'in_progress', 'pending_approval', 'completed');

team_tile_progress (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid        NOT NULL REFERENCES teams(id),
  tile_id               uuid        NOT NULL REFERENCES tiles(id),
  side_a_status         tile_status NOT NULL DEFAULT 'not_started',
  side_a_points_awarded int         NOT NULL DEFAULT 0,
  side_a_completed_at   timestamptz,
  side_b_status         tile_status NOT NULL DEFAULT 'not_started',
  side_b_points_awarded int         NOT NULL DEFAULT 0,
  side_b_completed_at   timestamptz,
  UNIQUE (team_id, tile_id)
)
```

---

### `submissions`
A player submits evidence that their team has completed a tile side. Moderators review and approve or reject it.

```sql
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected', 'needs_more_info');

submissions (
  id                    uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid               NOT NULL REFERENCES teams(id),
  tile_side_id          uuid               NOT NULL REFERENCES tile_sides(id),
  submitted_by_user_id  uuid               NOT NULL REFERENCES users(id),
  status                submission_status  NOT NULL DEFAULT 'pending',
  submitted_at          timestamptz        NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,
  reviewed_by_user_id   uuid               REFERENCES users(id),
  reviewer_notes        text,
  points_awarded        int,               -- set by moderator on approval
  is_wildcard_redemption boolean           NOT NULL DEFAULT false,
  wildcard_id           uuid               REFERENCES tile_wildcards(id),
  created_at            timestamptz        NOT NULL DEFAULT now(),
  updated_at            timestamptz        NOT NULL DEFAULT now()
)
```

**Key rules enforced at application layer:**
- A team may not submit Part B if Part A is not at least `completed`
- Submissions for tiles with a freeze period must have `submitted_at >= event.starts_at + freeze_duration`
- A wildcard can only be redeemed once per team (enforced via `team_wildcard_usage`)
- A single drop cannot be claimed on two tiles (e.g. one Scythe for both TOB 1 and TOB 2)

---

### `submission_screenshots`
One submission may require multiple screenshots (e.g. a main screenshot + a bank pre-screenshot).

```sql
CREATE TYPE screenshot_type AS ENUM ('main', 'pre_screenshot', 'bank', 'collection_log', 'other');

submission_screenshots (
  id               uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    uuid            NOT NULL REFERENCES submissions(id),
  screenshot_type  screenshot_type NOT NULL DEFAULT 'main',
  storage_url      varchar(512)    NOT NULL,
  uploaded_at      timestamptz     NOT NULL DEFAULT now()
)
```

**Tiles requiring pre-screenshots:**
- Wintertodt (empty WT cart)
- Tempoross (empty reward pool)
- GOTR (empty rift)
- Barrows/Moons/Gauntlet (optional pre-load screenshot)
- Phantom Muspah / Yama (if using forgotten lockbox: pre-clog screenshot)
- Blood Shards (pre-screenshot of collection log if thieving)

---

### `submission_item_claims`
The specific items a player is claiming within a submission. Links to the tile side item where applicable.

```sql
submission_item_claims (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      uuid        NOT NULL REFERENCES submissions(id),
  item_name          varchar(128) NOT NULL,
  quantity           int         NOT NULL DEFAULT 1,
  tile_side_item_id  uuid        REFERENCES tile_side_items(id)
)
```

---

### `team_wildcard_usage`
Tracks which wildcards a team has spent. Enforces the 1x redemption cap per team per wildcard.

```sql
team_wildcard_usage (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid        NOT NULL REFERENCES teams(id),
  tile_wildcard_id uuid        NOT NULL REFERENCES tile_wildcards(id),
  submission_id    uuid        NOT NULL REFERENCES submissions(id),
  used_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, tile_wildcard_id)
)
```

**Special case — Shadow (TOA 1 / TOA 2):**
Shadow is two separate wildcard entries (one per TOA tile), so the unique constraint naturally allows one redemption per tile.

---

### `bingo_lines`
Defines all 16 possible lines on the 7×7 board (7 rows + 7 columns + 2 diagonals). Each line awards 15 points.

```sql
CREATE TYPE line_type AS ENUM ('row', 'column', 'diagonal');

bingo_lines (
  id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  bingo_event_id  uuid      NOT NULL REFERENCES bingo_events(id),
  line_type       line_type NOT NULL,
  line_index      smallint  NOT NULL,  -- 0-6 for row/col; 0 = top-left diagonal, 1 = top-right diagonal
  points          int       NOT NULL DEFAULT 15
)
```

---

### `bingo_line_tiles`
Maps each line to its 7 constituent tiles.

```sql
bingo_line_tiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bingo_line_id uuid NOT NULL REFERENCES bingo_lines(id),
  tile_id       uuid NOT NULL REFERENCES tiles(id),
  UNIQUE (bingo_line_id, tile_id)
)
```

---

### `team_completed_lines`
Records when a team completes a line and their bonus is applied.

```sql
team_completed_lines (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid        NOT NULL REFERENCES teams(id),
  bingo_line_id   uuid        NOT NULL REFERENCES bingo_lines(id),
  completed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, bingo_line_id)
)
```

---

### `team_point_adjustments`
Manual point changes applied by moderators (penalties like -100 for hiding in CC, or corrections).

```sql
team_point_adjustments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid        NOT NULL REFERENCES teams(id),
  bingo_event_id      uuid        NOT NULL REFERENCES bingo_events(id),
  amount              int         NOT NULL,  -- negative for penalties
  reason              text        NOT NULL,
  created_by_user_id  uuid        NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
)
```

---

## Points Calculation

A team's total score is the sum of three components:

```
total_points =
    SUM(side_a_points_awarded from team_tile_progress WHERE side_a_status = 'completed')
  + SUM(side_b_points_awarded from team_tile_progress WHERE side_b_status = 'completed')
  + SUM(points from team_completed_lines JOIN bingo_lines)
  + SUM(amount from team_point_adjustments)
```

**Note:** `side_b_points_awarded` is only set to a non-zero value when both Part A AND Part B are completed. Part B can be submitted before Part A is finished, but points are not awarded until Part A is also done.

**Tiebreaker:** In case of a tie, the winner is determined by the timestamp of the submission that reached the tied score first. The `completed_at` timestamps in `team_tile_progress` and `team_completed_lines` support this.

---

## Tile Inventory (49 tiles)

| # | Badge | Tile | Part A pts | Part B pts | Total |
|---|---|---|---|---|---|
| 1 | Demonic | Doom of Mokhaiotl | 40 | 60 | 100 |
| 2 | Demonic | Cerberus | 25 | 40 | 65 |
| 3 | Demonic | Yama | 40 | 60 | 100 |
| 4 | Demonic | Abyssal Sire | 25 | 40 | 65 |
| 5 | Demonic | Zalcano | 25 | 40 | 65 |
| 6 | Demonic | Duke Sucellus | 20 | 45 | 65 |
| 7 | Demonic | Demonic Gorillas | 35 | 35 | 70 |
| 8 | Draconic | COX 1 | 40 | 60 | 100 |
| 9 | Draconic | Vorkath | 25 | 35 | 60 |
| 10 | Draconic | Hueycoatl | 25 | 25 | 50 |
| 11 | Draconic | Fossil Island Wyverns | 20 | 35 | 55 |
| 12 | Draconic | Zulrah | 25 | 50 | 75 |
| 13 | Draconic | COX 2 | 40 | 60 | 100 |
| 14 | Draconic | Alchemical Hydra | 25 | 40 | 65 |
| 15 | Spectral | Barrows | 30 | 35 | 65 |
| 16 | Spectral | Phantom Muspah | 25 | 40 | 65 |
| 17 | Spectral | Amoxliatl | 20 | 30 | 50 |
| 18 | Spectral | Moons of Peril | 35 | 35 | 70 |
| 19 | Spectral | Vet'ion | 25 | 40 | 65 |
| 20 | Spectral | Revenants | 35 | 40 | 75 |
| 21 | Spectral | Whisperer | 20 | 45 | 65 |
| 22 | Animalistic | Gauntlet | 35 | 35 | 70 |
| 23 | Animalistic | Callisto | 25 | 40 | 65 |
| 24 | Animalistic | Scurrius | 25 | 25 | 50 |
| 25 | Animalistic | Pets | 25 | 25 | 50 |
| 26 | Animalistic | Dagannoth Kings | 25 | 40 | 65 |
| 27 | Animalistic | Corporeal Beast | 35 | 45 | 80 |
| 28 | Animalistic | Sailing | 25 | 45 | 70 |
| 29 | God Wars | K'ril Tsutsaroth | 35 | 35 | 70 |
| 30 | God Wars | Commander Zilyana | 35 | 35 | 70 |
| 31 | God Wars | Wintertodt | 25 | 40 | 65 |
| 32 | God Wars | Nex | 40 | 60 | 100 |
| 33 | God Wars | Kree'arra | 35 | 35 | 70 |
| 34 | God Wars | General Graardor | 35 | 35 | 70 |
| 35 | God Wars | Tormented Demons | 25 | 40 | 65 |
| 36 | Vampyric | Blood Shards | 20 | 30 | 50 |
| 37 | Vampyric | TOB 1 | 40 | 60 | 100 |
| 38 | Vampyric | Araxxor | 25 | 40 | 65 |
| 39 | Vampyric | Vardorvis | 20 | 45 | 65 |
| 40 | Vampyric | TOB 2 | 40 | 60 | 100 |
| 41 | Vampyric | Nightmare | 40 | 60 | 100 |
| 42 | Vampyric | Venenatis | 25 | 40 | 65 |
| 43 | Desert | Colosseum | 40 | 60 | 100 |
| 44 | Desert | Pyramid Plunder | 20 | 35 | 55 |
| 45 | Desert | TOA 1 | 40 | 60 | 100 |
| 46 | Desert | GOTR | 25 | 40 | 65 |
| 47 | Desert | Leviathan | 20 | 45 | 65 |
| 48 | Desert | Tempoross | 25 | 40 | 65 |
| 49 | Desert | TOA 2 | 40 | 60 | 100 |

**Max tile points:** 3,375 &nbsp;|&nbsp; **Max line bonus:** 240 (16 lines × 15 pts) &nbsp;|&nbsp; **Max possible:** 3,615

---

## Key Application-Layer Rules

These constraints are too complex for the DB alone and must be enforced in business logic:

1. **Part B gating:** Part B points are only applied once Part A is also completed. Both can be submitted and approved independently, but points only flow when both sides are done.

2. **Freeze period:** Submissions for flagged tiles (`has_freeze_period = true`) must have `submitted_at > bingo_event.starts_at + interval '2 hours'`.

3. **Drop uniqueness across tiles:** A single item drop cannot be used for two tiles simultaneously. For example, one Scythe cannot count for both TOB 1 and TOB 2 (tracked via `submission_item_claims` — moderators review this during approval).

4. **Wildcard uniqueness:** Once a team redeems a wildcard, `team_wildcard_usage` blocks re-use (UNIQUE constraint).

5. **Alt account rule:** Only one account per player counts. Enforced at submission review — moderators can reject if an alt was used for DPS.

6. **Codeword verification:** Every submission screenshot must show the team's codeword via the Clan Events plugin or in chatbox. Moderators verify this visually.

7. **Line completion check:** After every submission approval, the server should recheck whether any new bingo lines have been completed by that team and insert into `team_completed_lines` if so.

---

## Open Questions

1. **Board layout** — Which badge category goes in which row/column? The `bingoBoard.png` image shows the physical layout and should be used to set `board_row` / `board_col` on tiles at seed time.
2. **Submission channel integration** — Will submissions come through a Discord bot reading a channel, or via the web UI, or both?
3. **Screenshot storage** — Where are screenshots hosted? (S3, Cloudflare R2, Discord CDN, etc.)
4. **Multiple submissions per tile side** — Can a team re-submit after a rejection, or does the original submission get updated? Recommend creating a new submission record each time and keeping history.
5. **DT2 ring tile cross-tile tracking** — Vardorvis, Leviathan, Whisperer, and Duke Sucellus all share a ring roll mechanic. Should ring rolls be tracked globally per player to prevent double-counting across all four tiles? This is likely a moderation concern rather than a DB constraint.
