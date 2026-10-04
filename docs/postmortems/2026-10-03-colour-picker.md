# Post-mortem: the site slowed to a halt after the Board reveal (2026-10-03)

**Status:** resolved. Trigger fixed in #446; follow-ups #451-#457.
**Impact:** about 5 minutes (15:47-15:51 EDT) in which the site loaded slowly or not at all ("This site can't be reached" in Chrome) for everyone, minutes after Tectonic's Comics Bingo moved to Board revealed, with up to ~105 Players around. No data was lost. Six Discord team syncs failed on Discord's rate limit and caught up by themselves.

Blameless: the Admin used the colour picker exactly as it invites you to. The picker, and the server behind it, are what failed.

## Timeline (EDT)

| Time | What happened |
|---|---|
| 14:29-14:32 | #442 (Discord team sync) deployed. From here every Team edit also syncs the Team's Discord role. |
| 15:05-15:39 | The Draft. Response times (p95) are 1.5-1.9s at its start and 0.6-0.8s through it, against 70-200ms normally. |
| 15:42 | Moved to Board revealed. The Wise Old Man competition is created. Players load the board and mark interest in Tiles. |
| 15:47:36 | An Admin starts setting Team colours. Each step of a drag across the colour picker saves the Team. |
| 15:47-15:51 | 434 Team updates over 3 Teams, peaking at 138 a minute (up to 9 a second). About 16,600 requests follow in those 5 minutes. p95 reaches 2.5s, pages time out, and CPU reaches ~155% (one core flat out; 100% = one vCPU). Discord rate-limits the bot from 15:47:57; 6 syncs fail. |
| ~15:50 | A new tab won't load the board. Sentry Issues is empty. The audit log, once it loads, is full of Team colour changes, each a slightly different hex. |
| 15:51:46 | The Admin is asked over Discord to stop. The site recovers at once. |
| 15:59-16:01 | #446 deployed: colour pickers save once, when the picker closes. |

## What happened

1. **The trigger.** The Team colour input saved from React's `onChange`, which is the browser's `input` event and fires on every step of a drag. A few seconds of dragging made dozens of `PATCH /admin/teams/:id` requests.
2. **The amplifier, and the real cause of the outage.**
   - Every successful Admin write broadcast `bingo_changed`, and broadcasts go to every open socket.
   - Every open page of the Bingo then refetched 15+ queries: the shell, board, Team progress, Team Submissions, Team activity, …
   - At about 38 reads per write, ~2 writes a second became ~55 requests a second on a single Node process, which then queued everything, including new page loads.
3. **Side load.**
   - Each burst started a Discord sync (queued syncs were merged, but they ran back to back) until Discord rate-limited the bot.
   - Every save also wrote an audit entry. Two of them changed nothing at all.

## Why it took a person to notice

- **Nothing failed, so nothing reached Sentry Issues.** The slowdown is only visible in Sentry's traces, which nobody watches and nothing alerts on.
- **The flood itself was invisible even in traces.** Sentry samples 10% of browser page loads, and the server follows the browser's decision. The Admin's page wasn't sampled, so none of its 434 requests were recorded. Only the other viewers' refetches show up.
- **Nothing outside the server checks that the site loads,** or how fast.
- **The site came back only because the Admin was told to stop.** Admins with the old page open could have set it off again until they reloaded, even after the fix shipped.

## What went well

- **The audit log named the cause within minutes:** one actor, Team colours, one after another.
- **The fix was small and shipped within 10 minutes:** a `ColorInput` that saves once.
- **Nothing was lost.** The Discord sync recovered by itself after the rate limit, and it records its failures rather than retrying in a loop.

## The near-miss: the Draft

With no bug at all, the Draft reached a full core and a p95 of ~1.9s:

- every pick, and every Captain's private rating, makes every watcher refetch the whole Draft state (~6,600 requests in the hour);
- a bigger Bingo, or a busier moment, would have tipped it over the same way.

The broadcast fix (#451) is the main protection for every future Draft and Board reveal, not only against the next bug like this one.

## Follow-ups

| # | What | Why |
|---|---|---|
| #451 | **Batch and narrow the broadcasts:** one event per Bingo per short window; each write refreshes only what it changes; only the sockets viewing that Bingo receive it. | Removes the amplifier. Covers the Draft. |
| #452 | **Server-side load warnings to Sentry Issues:** slow requests, event-loop lag, one user's write flood, traffic spikes. Unsampled counters. | Makes this kind of incident page someone in seconds, naming the route. |
| #453 | **An outside uptime check, plus Sentry issues posted to a private Discord channel** (phone push for downtime). Not through our own bot. | Detection that works when the server is struggling. |
| #454 | **A per-user write limit** (429). | One client, or an old tab, can't flood the server. |
| #455 | **Open pages reload after a deploy** (version check). | Old tabs don't keep a fixed bug alive. |
| #456 | **No write, audit entry, broadcast or sync when an update changes nothing.** | Cheaper no-ops; a cleaner audit log. |
| #457 | **A check that colour and range inputs never save on every change.** | Stops this trigger coming back. |
| #446 | Colour pickers save once, when the picker closes. | The trigger. Done. |

## Data sources

- **The audit log**, through the read-only data connection (`team.updated`, `discord.*`, `draft.*` between 14:00 and 21:00 EDT).
- **Sentry traces** for `tectonic-server` (counts and p95 per 5 minutes; the counts are scaled up from a 10% sample).
- **The server's CPU graph** and the deploy history (GitHub Actions). The other CPU spikes that day were the 14:30 and 20:35 deploys (expected, short) and the Draft.
