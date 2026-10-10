# Notifications, phone push and Catch-up: design

Status: **proposed design, not scheduled.** Written without a back-and-forth, so every choice the request left open is
decided below with its reasoning. Anything marked *(revisit)* is a judgement call worth a second look before building.
Read `CONTEXT.md` first (roles, stages, Submission, Tile/Part, Points share, Bingo Recap).

## The request

1. Optional **notifications** about what happens in a Bingo: the Team's Submissions, approvals, rejections, Tile and Part
   completions, and whatever else earns one.
2. Optional **phone push** for them.
3. A **"while you were gone"** summary, in the same spirit.

The goal is to not spam anyone: **everything is opt-in**, the defaults once opted in are conservative, and a "no" is
easy to find and undo.

## Principles (settled)

1. **Off until the user turns it on.** No notification, push or Catch-up is shown or sent to anyone who hasn't turned
   it on. There is no "on by default for Moderators" exception either.
2. **The browser's permission prompt only ever follows a click** on a button that says what it's for. Never on page load,
   never in a dialog that opens by itself. (Today's Mod panel does exactly that; see [Migration](#migrating-what-exists).)
3. **At most one offer, never a popup.** The app may *offer* notifications at a moment they'd obviously help (see
   [Offers](#offers-how-people-find-it-without-being-nagged)), as one dismissible inline line. Dismissing it is final for
   that offer. The settings page is always one click away regardless.
4. **Conservative when on.** Turning notifications on starts from the **Essentials** preset: only what is about *you*
   or needs *you* to act. Everything chattier (teammates' drops, Reactions, Part completions) is there to tick, unticked.
5. **Never what you couldn't see.** A notification carries only what its recipient may already see in the app, under the
   same rules: a Player gets nothing about another Team's progress while Live, nothing from sealed Tiles, no
   "first to complete" before Finished, nothing about someone else's Achievements, no Superlative votes. Built per
   recipient, on the server, through the same permission checks as the pages.
6. **Never about yourself.** No notification for what you did (or what was posted on your behalf by you).
7. **Quiet while you're looking.** If the user has the Bingo open and visible, nothing is pushed: the page already
   updates live. It may show a small in-app toast instead (for the kinds they ticked).
8. **Batched, capped, never stale.** Bursts are folded into one ("3 submissions waiting for review"), each person has a
   push budget, and a push that couldn't go out within its freshness window is dropped (it's still in the inbox and the
   Catch-up).
9. **Turning off never forgets.** Switching the master toggle, a Bingo, or a device off keeps the choices underneath, so
   switching back on restores exactly what was there.

## Naming (needs a glossary decision)

- **Notification**: one message to one user about something in a Bingo (or the site), shown in their **Inbox** and, if
  they chose, pushed to their devices.
- **Inbox**: the list of a user's Notifications behind the bell in the header. Read/unread, kept 30 days.
- **Push**: a Notification delivered by the operating system (phone or desktop) while the site isn't open.
- **Catch-up**: the "while you were gone" summary. **Not "Recap"**: `CONTEXT.md` already uses *Bingo Recap* for the
  family of looks back at a *Finished* Bingo (Rewind, Wrapped), and this is a mid-Bingo summary for one returning user.
  *(revisit the name; "Since you left" or "While you were away" also work as UI copy, but the term should be one word
  and not collide with Recap.)*
- Avoid: "alert" (Site admin alerting already uses it, `docs/alerting.md`), "digest" as a user-facing term.

Once settled these go into `CONTEXT.md` under a new **Notifications** section.

## 1. Notifications

### The catalogue

Every kind of Notification is one entry in a shared catalogue (`shared/src/notifications.ts`): a key, who can receive
it, which stages it applies in, whether it's in **Essentials**, how it batches, and its copy. The settings page, the
server's dispatcher and the generator all read this one list, so adding a kind is one entry plus its mapping.

"Ess." = ticked by the Essentials preset. Everything else starts unticked. A user only ever sees rows for roles they hold
somewhere (a Player who has never moderated doesn't see the Moderator rows).

**As a Player** (about you and your Team, only while you're a Player of that Bingo)

| Kind | When | Ess. | Batching |
| --- | --- | --- | --- |
| Your drop rejected | A Submission credited to you (or posted by you) is rejected; the body carries the reviewer's note | ✅ | none: it's actionable |
| Your drop approved | Approved; body names the Task(s) and points | ✅ | fold approvals in a 5 min window: "3 of your drops approved (+40)" |
| Drop posted for you | A teammate posted a drop credited to you | | 5 min |
| Credit changed | A Moderator moved a Submission's credit to or from you | | none |
| Team completed a Tile | Your Team completed a Tile (and any Line it closed) | ✅ | 5 min |
| Team completed a Part | Your Team completed a Part | | 5 min, folded into a Tile completion when both happen |
| Teammates' drops | A teammate's Submission (new, or approved) | | 15 min: "Lynx Titan and 2 others posted 4 drops" |
| Reactions on your drop | Teammates reacted | | 30 min, one per Submission |
| Proof screenshot needed | A drop of yours was flagged in review for a missing Proof screenshot | ✅ | none |
| Pairing request | Someone asked to be your Duo partner, or answered yours | ✅ | none |
| You were drafted | Your Team picked you (or your Duo) | ✅ | none |
| Bingo went Live / Finished | Your Bingo changed to Live, or to Finished | ✅ | none |
| Board revealed | Board revealed (Teams set) | | none |
| Wrapped is out | Wrapped published for a Bingo you played | ✅ | none |
| Feedback form open | The Bingo you played is Finished and its Feedback form has questions | | none |
| Superlative voting | Once, a day before an announced end date, if you haven't voted | | none |
| Removed / Restricted | You were removed from your Team, or an Action of yours was restricted (with the reason) | ✅ | none |

**As a Captain**

| Kind | When | Ess. | Batching |
| --- | --- | --- | --- |
| On the clock | Your Team is picking in the Draft | ✅ | none; not pushed again if you're already in the Draft room |
| Draft starting | The Draft stage began | ✅ | none |

**As a Moderator** (of that Bingo)

| Kind | When | Ess. | Batching |
| --- | --- | --- | --- |
| Submissions waiting | New Submissions in the review queue | ✅ | 10 min, and only when the queue goes from empty to non-empty or grows after you've looked: "5 waiting, oldest 12 min" |
| Queue waiting long | The oldest pending Submission has waited longer than *N* (30 min / 1 h / 2 h, default 1 h) | | once per crossing |
| Signups | New signups (Signups open) | | 1 h |

**As an Admin / Staff**

| Kind | When | Ess. | Batching |
| --- | --- | --- | --- |
| Bingo went Live by itself | A Bingo reached its start date and went Live | ✅ | none |
| Cut warning | Signups closed with an Unavoidable cut | | none |
| Bug report filed | (Site admins) a new bug report | | 1 h |
| Buy-in marked | (Staff) someone else marked a Buy-in received | | 1 h |

**Site-wide** (anyone)

| Kind | When | Ess. | Batching |
| --- | --- | --- | --- |
| New Bingo open for signups | A Bingo moved to Signups open | | none |

What is deliberately **not** a Notification: Achievement unlocks (they already have their own popup, which plays on next
open), Stats and Title changes (too noisy, and Titles shift constantly), other Teams' progress, Draft picks by other
Teams, every audit entry.

### Where it shows

- **Inbox**: a bell in the header (`AppHeader`), with an unread count. It's there **only once notifications are on**;
  until then the account menu has a "Notifications" item instead (see [Settings](#settings)). Each entry links to what
  it's about (the Submission in the Team activity, the Tile, the Mod panel's Submissions tab), and has a ⋯ menu:
  **Turn off this kind**, **Mute this Bingo**. Opening the Inbox marks entries read.
- **Toast**: if the user has the site open, ticked kinds show as the existing `toast()` (not for the Bingo page they're
  on if the page already shows the change, e.g. the board animates a completed Tile).
- **Push**: see [part 2](#2-phone-and-desktop-push).

### Anti-spam rules (server-side, not optional)

- **Batching**: each kind has a window (tables above). The first event of a group opens it; the group is delivered when
  the window ends, as one Notification with a count. A group key is `(user, bingo, kind[, submission])`.
- **Push budget**: at most **1 push per Bingo per 5 minutes** and **6 per hour** per user. Over budget, the Notification
  still lands in the Inbox; the next allowed push says "+4 more in your inbox".
- **Freshness**: a push not sent within 2 h of its event is dropped (Inbox only). A Pairing request or On the clock
  is dropped as soon as it's no longer true (answered, picked).
- **Quiet hours** (off by default): a start and end time in the user's own timezone (sent by the browser). During them
  nothing is pushed except kinds the user marks "even in quiet hours" (only offered for On the clock and Pairing request).
- **Snooze**: from the Inbox or a push action: 1 hour, until tomorrow morning, or for this Bingo until it's Finished.
- **Stage gating**: a Bingo that's Finished sends only Wrapped is out and Feedback form open. A Historical Bingo sends
  nothing.

## 2. Phone and desktop push

### Mechanism: Web Push (recommended)

The site becomes an installable PWA with a service worker, and uses the standard **Web Push** API (VAPID keys,
`web-push` npm package on the server). One mechanism covers:

- **Android** (Chrome, Firefox, Samsung): works straight from the browser.
- **Desktop** (Chrome, Edge, Firefox, Safari): works from the browser, even with the tab closed (browser running).
- **iPhone/iPad**: iOS 16.4+ only once the site is **added to the Home Screen**. The settings page detects iOS Safari not
  running as an installed app and shows the 3-step "Share → Add to Home Screen → open it from there" guide instead of a
  dead button.

The existing **phone login** (QR code from a logged-in browser, `phoneLoginService`) is the bridge: the settings page on
a desktop has **"Get these on your phone"**, which shows that QR code with a return path to the notifications page, so
the phone lands logged in on the page where it can enable push.

Each device is its own **push subscription**, listed in settings ("iPhone · Safari, added 3 Oct, last delivered 2 h
ago") with **Remove** and **Send a test**. Push on/off is per device; the kinds ticked are per user (one set of
choices, every device).

Payloads are encrypted end to end by Web Push, and are built per recipient under principle 5, so they carry the title,
a short body and a link, nothing more (no screenshot, no codeword). A subscription the push service reports gone
(404/410) is deleted; one failing for 7 days is deleted too.

Clicking a push opens (or focuses) the site at its link. Each push carries two actions where the platform supports
them: **Mute this Bingo** and **Settings**.

### Alternative considered: Discord DMs

Every user is in the clan's Discord and the bot already exists (`discordTeamService`), so a DM would reach every phone
with no install step, iOS included. **Not in v1** *(revisit)*: DMs from a bot read as spammier than an OS notification,
users who have server DMs off silently get nothing, the bot's DM rate limits are tight, and a DM channel is shared with
the clan's other bots. It fits better as a later, single-purpose option ("DM me when I'm on the clock / get a Pairing
request") than as a general channel. The design keeps channels pluggable so it can be added as a third column.

## 3. Catch-up ("while you were gone")

### What it is

When a user who turned Catch-ups on opens a Bingo they haven't had open for a while, the top of its page shows a
**Catch-up card**: what happened since they were last there, from their point of view, folded down to what matters.

- **"A while"**: 8 hours by default; choices 4 h, 8 h, 24 h. Measured from when they last had that Bingo open and
  visible (see [Presence](#data-model)), not from login.
- **Only when there's something**: no card if nothing in it would have content.
- **Stages**: Draft (picks made, who your Team took), Board revealed (Team name, Board revealed), Live (the main case),
  and once on the first visit after it's Finished (final standing, Wrapped if out). Not in Planning or Signups.

### What's in it

In this order, each section only if it has content, all subject to principle 5:

1. **Needs you**: a rejected drop of yours (with the note and a "Submit again" link), a missing Proof screenshot, a
   Pairing request, On the clock, Superlative ballot not cast. For Moderators: the queue ("7 waiting, oldest 2 h").
2. **Your drops**: approved / rejected / still pending since you left, with points.
3. **Your Team**: points gained (+120), Tiles, Parts and Lines completed, and the standing if the viewer can already see
   the scoreboard. Biggest drop and the most-reacted Submission, credited by name.
4. **Bingo**: stage changes, time left until the end date.

Collapsed it's one line ("Since yesterday 21:40: +120 points, 2 Tiles, your Vorkath drop was approved"); expanded it's
the sections, each line linking to the thing. It's a card in the page, never a modal: it doesn't block the Board, and
scrolling past it is fine. **Got it** dismisses it until the next time away; it also goes once the user has stayed
on the page a few minutes.

The data is all there already: the Team activity feed (`queryTeamActivity`, audit entries visible to the Team),
`team_node_state.completedAt` for completions, `submissions` for statuses and review notes, and the stats service's
points-over-time for the points delta. Catch-up is a read endpoint (`GET /api/bingos/:slug/catch-up?since=`) that
assembles them for the viewer, under the same visibility rules as those pages.

### As a push (optional)

A **daily Catch-up** push, off by default even when Catch-ups are on: once a day at a time the user picks, only for a
Live Bingo they're in, only if they haven't opened it that day, only if there's something. Its body is the collapsed
line. It counts against the push budget.

## Settings

One page, **Notifications** (`/settings/notifications`), site-level, reachable from:

- the account menu: "Notifications", with a status after it: **Off**, **On**, or **Blocked** (when the browser
  denies permission on this device and push was wanted);
- the bell's menu, once on;
- every push (Settings action), every Inbox entry's ⋯ menu, the Catch-up card's ⋯ menu;
- the Bingo's ☰ menu: "Notifications for this Bingo" (opens the page scrolled to that Bingo).

Layout, top to bottom:

1. **Master switch**: "Notifications: Off / On". Turning it on preselects **Essentials**, shows what that means in one
   sentence, and lets them pick **Everything for my roles** or **Custom** instead.
2. **This device**: push for this device, with a single button **Allow on this device** (the only place the browser
   permission prompt is ever requested). If the permission is **denied**, the button is replaced by plain instructions
   for the detected browser/OS ("Chrome: click the icon left of the address, Site settings, Notifications, Allow") and a
   **Check again** button. If it's iOS not installed, the Home Screen guide.
3. **What to notify about**: the catalogue as a table, grouped by role, each row with two ticks: **Inbox** and **Push**
   (Push greyed out with "no device" if none). Group-level "all/none" ticks.
4. **Catch-up**: on/off, the "away for" threshold, the daily Catch-up push and its time.
5. **Quiet hours and snooze**: quiet hours on/off with times; current snoozes with **End now**.
6. **Bingos**: each Bingo the user is in that isn't Finished: **Use my settings** (default) / **Mute**. Mute is the
   only per-Bingo choice in v1; a per-Bingo matrix is more knobs than anyone needs *(revisit if asked)*.
7. **Devices**: every push subscription, with Send a test and Remove.

Choices are stored **on the server** (they decide what the server sends, and must follow the user across devices).
Only "has this browser been offered" lives in `localStorage`, alongside `core/ui/preferences.ts`.

## Offers: how people find it without being nagged

The feature is invisible until turned on, so it's offered, once each, at a moment it plainly helps. Each is one
inline line with **Turn on** and **No thanks**, never a dialog, never the browser prompt:

| Where | When | Says |
| --- | --- | --- |
| Submit flow's success state | A Player's first Submission in a Bingo | "Want to hear when it's reviewed?" → turns on with Essentials |
| Mod panel, Submissions tab | A Moderator's first visit with notifications off | "Get told when Submissions are waiting?" |
| Draft room | A Captain with notifications off, once the Draft order is set | "Get told when you're on the clock?" |
| Board page | Returning to a Live Bingo after 8 h+ away, Catch-ups off | "You've been away a while. Show a catch-up when you're back?" (and shows this one) |

Rules: **at most one offer per user per Bingo**, and once dismissed, that offer never comes back for that account (stored
server-side so it holds on every device). "Turn on" doesn't ask for push: push is a second, explicit step on the
settings page, which the offer's confirmation links to ("Also on your phone? Set it up").

## Data model

Additive tables (fine under `migration-safety`):

- `notification_settings` — one row per user: `enabled` (default false), `preset`, `quietHoursStart`/`End`,
  `timezone`, `catchUpEnabled` (default false), `catchUpAfterHours` (8), `dailyCatchUpAt` (null = off),
  `offersDismissed` (JSON list of offer keys).
- `notification_prefs` — only the user's overrides of their preset: `(userId, kind)` → `inbox`, `push`.
- `notification_mutes` — `(userId, bingoId | null, until | null)`: per-Bingo mutes and snoozes.
- `push_subscriptions` — `endpoint` (unique), `p256dh`, `auth`, `userId`, `label`, `createdAt`, `lastSuccessAt`,
  `failingSince`, `enabled`.
- `notifications` — the Inbox and the batching queue in one: `userId`, `bingoId`, `kind`, `groupKey`, `count`, `title`,
  `body`, `url`, `firstEventAt`, `deliverAt` (end of its batching window), `deliveredAt`, `pushedAt`, `readAt`.
  Rows older than 30 days are deleted by the daily cleanup.
- `bingo_presence` — `(userId, bingoId)` → `lastSeenAt`, `catchUpShownAt`. Updated by the client while the Bingo is open
  and visible, at most once a minute (piggybacks on the existing WebSocket `watch` message, so no new request).

## Server design

- **One dispatcher, fed by the audit log.** Every action that matters is already recorded with `audit()` (actor, Team,
  visibility, entity): `submission.created`, `submission.approved`, `submission.rejected`, `points.earned`,
  `draft.pick`, `stage.changed`, `submission.reaction_set`, `team.member_removed`… A `notificationDispatcher` runs after
  the request's transaction commits (the audit context already groups a request's entries), maps each entry to zero or
  more catalogue kinds, resolves recipients through the existing permission checks (`viewerCan`, Team membership,
  Moderator lists), drops the actor, and upserts into `notifications` by group key. A kind not derivable from audit
  (Queue waiting long, daily Catch-up) comes from the scheduler. This keeps "a new feature gets notifications" to one
  mapping entry next to its audit action.
- **Delivery tick**: every 30 s (the server is one Node process with SQLite, like `bingoStartService`'s start check),
  deliver rows whose `deliverAt` has passed: mark delivered, send `notifications_changed` to that user over the
  existing socket (`broadcast(..., { to: [userId] })`, ids only, per the unauthenticated-broadcast rule), and push if
  the kind is ticked for push, the user isn't currently looking (an open visible socket on that Bingo), it isn't quiet
  hours or muted, and the budget allows. The table is the queue, so a restart loses nothing.
- **Secrets**: VAPID public/private key pair, set like the other secrets (`docs/secrets-plan.md`); without them push is
  hidden from the settings page and everything else works.
- **Audit**: changing one's own notification settings isn't audited (it's personal and affects nobody else). Pushes are
  logged (`log.info`, counts only) for the alerting dashboards.

## Migrating what exists

Today the Mod panel opens an **"Enable notifications?"** dialog by itself on first visit and calls the browser prompt,
and both `ModPage.tsx` and `usePageEvents.ts` raise a `new Notification("New bingo submission")` on every
`submission_created` while permission is granted, unbatched. That breaks principles 2, 3 and 8.

- Remove the auto-opening dialog and both direct `new Notification` calls.
- A Moderator who had granted permission (`localStorage.mod_notif_prompted` and `Notification.permission === "granted"`)
  opted in once, so they shouldn't silently lose it: on their next Mod panel visit they get a one-time inline line,
  "Submission alerts moved to Notifications. **Keep them** / **Turn off**". Keep turns on notifications with only
  Submissions waiting ticked, Inbox and Push, and subscribes this browser for push.

## Test data generator

Per `CLAUDE.md`, a generated Bingo shows the feature, made through the real endpoints:

- A share of generated Players turn notifications on (most Essentials, some Custom with chattier kinds), a couple turn
  Catch-ups on, one has quiet hours, one has muted the Bingo. Every generated Moderator turns on Submissions waiting.
- Their Inboxes fill from the seeded play itself (the dispatcher runs on the generator's real requests, at their
  spoofed timestamps), so batching shows realistic groups.
- Presence is seeded so that logging in as a generated Player shows a Catch-up (their `lastSeenAt` a day back).
- No real push subscriptions: in dev mode a **fake push sink** endpoint records pushes, and the dev tools list what
  would have been pushed to whom.

## Phases

1. **Settings, catalogue, dispatcher, Inbox.** Server tables, the dispatcher on audit entries, delivery tick with
   batching, the settings page (no push column yet), the bell, toasts, the offers, and the Mod panel migration. Generator
   support.
2. **Catch-up.** Presence tracking, the catch-up endpoint, the card, its offer, generator presence.
3. **Push.** Manifest and service worker (installable PWA), VAPID, subscriptions and device list, push delivery with
   budget/quiet hours/freshness, push actions, iOS Home Screen guide, "Get these on your phone" via the phone login QR,
   the daily Catch-up push, the dev fake push sink.
4. **Later, if wanted.** Discord DM channel for On the clock and Pairing requests; a per-Bingo kind matrix.

Each phase is useful on its own; push is last because it carries the most setup (PWA, keys, iOS caveats) and the
Inbox and Catch-up already cover "I wasn't looking".

## Decisions taken without the requester *(revisit any)*

- Name **Catch-up**, not Recap (glossary collision).
- Inbox exists only once notifications are on (strictly opt-in), rather than a silent always-on Inbox.
- Essentials = about you or needs you: rejections, approvals (batched), your Team's Tile completions, Draft and
  Pairing, Live/Finished, Wrapped, removals/restrictions; Moderators: Submissions waiting. Teammates' drops, Part
  completions and Reactions are opt-in on top.
- Push budget 1 per Bingo per 5 min, 6 per hour; push freshness 2 h; Catch-up threshold 8 h.
- Web Push first; Discord DMs deferred.
- One offer per user per Bingo, dismissal is permanent and account-wide.
