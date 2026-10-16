# Wrapped: an Achievements section

A new Wrapped section dedicated to Achievements (CONTEXT.md "Achievement"), after The Bingo and before the Outro, in
both themes. It gathers the Achievement panels The Bingo section shows today and adds a longer leaderboard,
participation, unlocks over time, and the viewer's own place.

## Decisions

| Question | Decision |
| --- | --- |
| Where | A new section `achievements`, labelled **Achievements**, between The Bingo and the Outro. It's in the comic's "In this issue" contents and has its own anchor (`#achievements`). |
| The Bingo's existing panels | **Moved**: "Most achievements by", "Completed all first, at" and the Teams ranking leave The Bingo section, so nothing shows twice. |
| Leaderboard | Up to **10** Players (fewer if 10 don't fit a comic page at phone width: settle it from screenshots, never below 5). Most earned first; a tie goes to whoever reached that count first (their last Achievement's earn time), then name. **Placements are distinct** (1st to 10th): a tie is broken by time, so it's never shared. |
| Per-Achievement stats | **Only the viewer's own**, keeping CONTEXT.md "Rarity" (a Player sees an Achievement's rarity only once they've earned it) and "Hidden" (a ??? until earned). No Bingo-wide most or least common list, and nothing ever names who earned a particular Achievement. |
| Participation | How many Players earned at least one, out of how many (and the %), Achievements earned in all, the average per Player, how many earned every one, and who did it first (the existing "Completed all first"). |
| Teams | Teams ranked by their Players' Achievements added up, with the average per Player (as today, moved). |
| Your place | On the viewer's own Wrapped (a Player only): their count out of the total, their place in the same ordering as the leaderboard ("#14 of 80"), and their rarest Achievements with the % of Players who have each. |
| Unlocks over time | Achievements earned per day of the Bingo (UTC days, like "Most active day"), and the busiest day. |
| Who counts | As today (`achievementLeadersOf`): Players on a Team when Wrapped is published, only the Achievements switched on for the Bingo. |
| When the section shows | When the Bingo has Achievements switched on and at least one was earned. Otherwise it's left out (like every other section with nothing to say). |
| Art | `achievements` becomes a Wrapped art section, so Admins can give it Category images and credits like the others (`WRAPPED_ART_SECTIONS`). |
| Older Wrapped | Every new stored field is optional ("Missing from Wrapped published before it was stored"). A Wrapped published before this shows the section with what it has (the old top 5, Teams, first to all); a Moderator publishing again fills the rest. |

## Data (stored at publish)

`shared/src/wrapped.ts`:

- `WrappedAchievementLeaders` (Bingo-wide, `BingoWrapped.achievements`):
  - `top`: now up to 10 (`TOP_ACHIEVERS` in `server/src/services/wrappedService.ts`).
  - New, all optional: `players` (Players counted), `playersWithAny`, `earnedTotal` (every earn added up), `allCount`
    (Players who earned every one), `byDay: { date: string; earned: number }[]` (UTC YYYY-MM-DD, every day from the
    first earn to the last, days with none included as 0 so a chart has no gaps).
  - Nothing per Achievement key here: this part is served to every viewer.
- `WrappedYou` (per Player; only that Player is served it, as `MyWrappedResponse.player`):
  - Each `achievements[]` entry gains optional `earnedByPercent` (whole %, as the in-app Rarity rounds it, of the
    Players counted above).
  - New optional `achievementRank: { rank: number; players: number } | null`: their place in the leaderboard's ordering
    among every Player counted (Players with 0 come after everyone with any, tied at the bottom by name). Null when they
    earned none.

`server/src/services/wrappedService.ts`: extend `achievementLeadersOf` (and its tests) to produce the new fields and the
per-Player rank and percentages from the one pass. `getEarnedAchievements` already gives each Player's earns with
`earnedAt`.

## Headless model

`client/src/headless/types.ts` / `wrappedModel.ts`:

- `WrappedAchievementsModel` (`kind: "achievements"`), added to `WrappedSectionModel`, with `SECTION_LABEL.achievements =
  "Achievements"`, pushed after `bingo` and before `outro`.
- Its parts, all worded in the model like the rest (labels, not raw numbers):
  - `leaderboard`: today's `top` entries (person, placement, earned, "of 23", when, Team), placement now `ordinal(i + 1)`.
  - `participation`: `playersLabel` ("72 of 80 Players"), `percentLabel` ("90%"), `earnedLabel` ("612 earned"),
    `averageLabel` ("7.7 per Player"), `allLabel` ("3 earned every one", null when 0), `allFirst` (moved). Null on an
    older Wrapped without the counts, except `allFirst`.
  - `teams`: moved from `WrappedBingoModel.achievements.teams`.
  - `byDay`: `{ dayLabel; earned; isBusiest }[]` plus `busiestLabel` ("Sat 12 Oct: 140"). Null with fewer than 2 days.
  - `you`: `{ earnedLabel: "9"; outOfLabel: "of 23"; rankLabel: "#14 of 80"; rarest: { name; itemName; percentLabel }[] }`,
    rarest first, up to 3; null for a viewer who isn't a Player or earned none.
- `WrappedBingoModel.achievements` is removed, with its comic and default panels.

## Themes

Both themes get a `WrappedAchievements` slot (`client/src/themes/slots.ts`), wired in the comic `WrappedPage.tsx` and the
default `WrappedPageLayout.tsx` like the other sections.

- **Comic** (`client/src/themes/comic/wrapped/sections/WrappedAchievements.tsx`): the panels move here from
  `WrappedBingo.tsx` (`TopAchievers`, `AllFirst`, `AchievementTeams`) and are reused. Scenes, in order: a splash with the
  section's art and participation as the title ("72 of 80 Players unlocked one"), the leaderboard, participation figures
  with "Completed all first" (`Minis`-style cells), unlocks per day (a bar per day in the comic palette, the busiest
  lettered), Teams, then "Your place" for a Player. Every page has to fit at phone width without scrolling: check with
  Playwright screenshots at 390×844 and desktop, and cut the leaderboard (not below 5) if 10 don't fit.
- **Default** (`client/src/themes/default/wrapped/WrappedAchievements.tsx`): the same parts as cards, in the style of
  `WrappedBingo.tsx`'s `Achievements`, which moves here. A plain bar chart from design tokens for unlocks per day.
- Colours from tokens / the comic palette only.

## Tests

- Server: `achievementLeadersOf` with ties broken by time and distinct ranks, the 10 cap, participation counts, `byDay`
  with an empty day in the middle, per-Player rank and `earnedByPercent`, Players with none; the published Wrapped never
  carries per-key data Bingo-wide.
- Headless: the section shows only with something earned, sits after The Bingo, words each part, handles an older
  Wrapped (no new fields), and The Bingo section no longer has achievements.
- Themes: the existing section tests move from The Bingo to the new section; a render test per theme.

## Verifying

On a generated Finished Bingo (write only to generated Bingos), publish Wrapped again as `dev-admin`, then check as a
Player on it, and as a Moderator who isn't playing (no "Your place"):

- comic and default themes, light and dark, at phone width and desktop;
- the comic "In this issue" lists Achievements and its anchor works;
- the leaderboard order against the database (count, then time reached);
- The Bingo section no longer shows the moved panels;
- Site admin's Wrapped art manager lists the new category.

## Not in scope

- A share card for Achievements.
- Changing the in-app Rarity or Hidden rules.
