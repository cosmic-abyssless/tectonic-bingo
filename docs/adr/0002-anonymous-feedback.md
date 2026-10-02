# Feedback responses are tied to a keyed hash, not a user

A Feedback response has to be anonymous to everyone, Moderators, Admins and anyone reading the database included, yet its Player must be able to come back and edit it. So a response stores only a one-way keyed hash (HMAC) of the user and the Bingo, made with a dedicated server secret (`FEEDBACK_SECRET`), never a user id. The server recomputes the hash to find the caller's own response; nobody can turn a stored hash back into a person without the secret. A Captain's answers to captain-only questions are a separate Captain response with its own hash, so they don't mark the Player's general response as a Captain's.

Responses carry no timestamps and are listed in a fixed shuffled order, and answering writes nothing to the audit log, since any of those could be lined up with a Player's other activity.

## Considered Options

- **A user id hidden by the app:** anonymous only until someone reads the database (the admin SQL tool, a backup).
- **No link at all:** truly unlinkable, but then answers can't be edited.

## Consequences

- `FEEDBACK_SECRET` must stay the same once a form has responses. A different one (changed, lost, or another environment's) would find nobody's response, so every Player who answered could answer again and be counted twice. So each response also records which secret keyed it (`key_check`, an HMAC of a fixed label: the same for every response, naming no one), and a form whose responses carry another secret's takes no answers until the original is restored. The answers and results are untouched; it never exposes anyone.
- There is never a stand-in secret. A built-in default (the repository is public) would let anyone with the database recompute every respondent, and a made-up one would change on every restart, with the same double counting. Without `FEEDBACK_SECRET` the server still runs, and Feedback forms take no answers, saying why to Players and to Moderators and Admins; only answering needs the secret, so results are shown either way.
- Who answered can't be recovered later, not even to remove a response. That's the point.
- The hash column is denied in the admin SQL tool's classification, and it isn't exported (answers aren't exported at all).

## How the implementation keeps to it

Anonymity is more than the missing user id, so the rest of what could line a response up with a Player is closed too:

- The hash covers the response's kind (Feedback or Captain), so a Captain's two responses share no value, and neither stores a user id. Their ids are random.
- The two response tables are `WITHOUT ROWID`, so rows are stored in id order and the order they came in (a Captain's two responses written one after the other, say) can't be read off the file. Results are listed by that same random id.
- The routes where a Player answers are marked `auditSkip`, send no WebSocket event, and leave the user out of the request log line and the error report's user (`server/src/anonymousRoutes.ts`).
- Anyone holding both the secret and the database can recompute the hash for any user and Bingo, so `FEEDBACK_SECRET` is kept like the session secret: never logged, exported or shared between environments. `key_check` is denied in the SQL tool too: it names no one, but it is made with the secret.
