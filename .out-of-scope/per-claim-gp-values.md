# Per-Claim GP values for a shared Task

A Task's GP value (**Valued as**) is one value per Task. It can't vary with where a particular Claim came from, for example a Gold ring from Vardorvis versus one from Duke Sucellus on a shared Gold ring Task.

## Why this is out of scope

GP values are looked up by item name: the Grand Exchange price, or the site-wide Piece value for items with no GE price. A Gold ring from a DT2 boss is the exception: it counts as a third of *that boss's* vestige (7–33M), while an ordinary Gold ring is worth ~160 GP. A site-wide rule can't express that, so the value comes from the Task via **Valued as**.

That holds as long as one Task means one source. The board keeps that true by design: each DT2 Part is exactly one boss with its own Gold ring Task. A board that wants several bosses in one Part should do the same, with one Gold ring Task per boss. That's a board change and needs no code.

The alternatives are the poster picking the boss when claiming, or a Moderator pricing each Claim at review. Both add a per-Claim pricing path, UI and review work for a case the board layout already avoids.

## Prior requests

- #189: "GP value: a shared Gold ring Task can't tell DT2 bosses apart"
