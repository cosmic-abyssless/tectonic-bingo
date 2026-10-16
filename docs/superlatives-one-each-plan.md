# Superlatives: one per Player

> **Changed after #560:** a tie for the lead is shared, not picked at random. Every tied Player counts as having won,
> and a tie has no margin, so it's decided after the clear wins: a tied Player who clearly won another category keeps
> that one instead. See `awardOneEach` in `server/src/services/superlativeService.ts`.

A per-Bingo option so no Player wins more than one Superlative (CONTEXT.md "Superlative") on their Team. A Player who
tops several categories keeps the one they won by the biggest margin; the others go to the runner-up who hasn't won one.

## Decisions

| Question | Decision |
| --- | --- |
| Where it's set | A per-Bingo setting, **One Superlative per Player**, off by default. Only Admins change it, in the Superlatives manager (`client/src/core/admin/SuperlativesManager.tsx`, where the categories are), saved at once like the other settings. Changeable at any stage: it only decides the winners, never the votes. |
| Scope | Per Team, as Superlatives are. |
| Which one a Player keeps | The category they won by the biggest margin: their votes minus the next eligible nominee's votes in it. |
| The others | Go to the runner-up: the nominee with the most votes among those who haven't won a category. A nominee needs at least one vote. With nobody eligible left, the category has no winner. |
| Ties for the lead | Picked at random, with a stable pick (seeded from the category and nominee ids), so a Moderator's preview and the published Wrapped agree. Each category then has exactly one winner. |
| Option off | Unchanged: a tie is shared, and a Player can win several. |
| When it applies | Where the winners are worked out (`computeWinners`, used when Wrapped is computed). A Wrapped already published keeps its winners until it's published again. |
| Admin vote counts | Unchanged (`getTallies`). |

## Algorithm (`server/src/services/superlativeService.ts` `computeWinners`)

With the option on, per Team:

1. Keep a set of categories still to award (those with any votes) and a set of Players who have won.
2. For each category still to award, look only at nominees with at least one vote who haven't won. Drop the category if
   none is left. Its leader is the nominee with the most votes, a tie picked with the stable random pick. Its margin is
   the leader's votes minus the most votes of any other eligible nominee in it (minus 0 when nobody else is left, so a
   sole nominee's margin is their votes).
3. Award the category with the biggest margin to its leader (a tie between categories goes to the earlier category in
   the Admin's order). Add the leader to the winners and remove the category.
4. Repeat from 2 until no category is left.

The result keeps the shape `CategoryWinners` (one `winnerUserIds` entry each), in the categories' order.

Margins are recomputed every round, so a category whose leader already won another is judged on its runner-up.

## Everything a new setting touches

Follow `publishWrappedOnFinish` through the codebase. It's the closest existing boolean setting:

- schema column on `bingos`, plus a migration. Name the file one past the latest in `server/drizzle/` (0074), fix the
  tag in `meta/_journal.json`, and restore any `meta/NNNN_snapshot.json` that `drizzle-kit generate` overwrote;
- the shared `Bingo` type and `toPublicBingo`;
- `routes/admin.ts` settings validation, `bingoService.updateBingoSettings` params, and the audit diff (`shared/src/audit.ts`);
- export/import (`bingoExportService.ts`, `shared/src/bingoExport.ts`);
- `wrappedService` passes the setting to `computeWinners`;
- **test data generator** (`server/src/devTools/generateBingo/superlatives.ts` / `run.ts`): a seeded share of generated
  Bingos turn it on through the real settings endpoint, as an Admin would.

## Copy

- Checkbox: **One Superlative per Player**.
- Hint: "A Player who tops more than one keeps the one they won by the most votes. The others go to the runner-up. Ties are picked at random."
- CONTEXT.md "Superlative" > Results: add the option.

## Tests

- `computeWinners`:
  - off: unchanged, ties shared;
  - on: a Player topping two keeps the bigger margin and the other goes to the runner-up;
  - the runner-up who already won is skipped for the next;
  - a category with nobody eligible left has no winner;
  - a leader tie gives one winner, and the same one every time;
  - a margin tie between categories goes to the earlier category.
- Settings route: the boolean is validated, saved and audited.
- Export/import round-trip.
- The generator turns it on for some seeds.
