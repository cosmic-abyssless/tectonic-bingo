# Feedback responses are tied to a keyed hash, not a user

A Feedback response has to be anonymous to everyone, Moderators, Admins and anyone reading the database included, yet its Player must be able to come back and edit it. So a response stores only a one-way keyed hash (HMAC) of the user and the Bingo, made with a dedicated server secret (`FEEDBACK_SECRET`), never a user id. The server recomputes the hash to find the caller's own response; nobody can turn a stored hash back into a person without the secret. A Captain's answers to captain-only questions are a separate Captain response with its own hash, so they don't mark the Player's general response as a Captain's.

Responses carry no timestamps and are listed in a fixed shuffled order, and answering writes nothing to the audit log, since any of those could be lined up with a Player's other activity.

## Considered Options

- **A user id hidden by the app:** anonymous only until someone reads the database (the admin SQL tool, a backup).
- **No link at all:** truly unlinkable, but then answers can't be edited.

## Consequences

- `FEEDBACK_SECRET` must stay the same for as long as any Feedback form is open. Changing it, or losing it, cuts every Player off from editing their response; it never exposes anyone.
- Who answered can't be recovered later, not even to remove a response. That's the point.
- The hash column is denied in the admin SQL tool's classification, and it isn't exported (answers aren't exported at all).

## How the implementation keeps to it

Anonymity is more than the missing user id, so the rest of what could line a response up with a Player is closed too:

- The hash covers the response's kind (Feedback or Captain), so a Captain's two responses share no value, and neither stores a user id. Their ids are random.
- The two response tables are `WITHOUT ROWID`, so rows are stored in id order and the order they came in (a Captain's two responses written one after the other, say) can't be read off the file. Results are listed by that same random id.
- The routes where a Player answers are marked `auditSkip`, send no WebSocket event, and leave the user out of the request log line and the error report's user (`server/src/anonymousRoutes.ts`).
- Anyone holding both the secret and the database can recompute the hash for any user and Bingo, so `FEEDBACK_SECRET` is kept like the session secret: never logged, exported or shared between environments, and the server won't start without it.
