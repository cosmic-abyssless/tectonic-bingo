# Discord bot login codes: plan

> **THEORETICAL. Not built.** Parked 2026-09-24 in favour of the QR-code phone login (a desktop that's already
> logged in shows a QR code the phone scans), which is less work and needs nothing from Discord. Come back to this
> if players who only use a phone are still getting stuck at Discord's login page.

## The problem

On a phone, "Log in with Discord" sends players to Discord's **web** login page, which asks for an email and password.
Most people only use the Discord app, don't know their password, and give up there. The bingo link opened from
inside Discord lands in Discord's in-app browser, which isn't signed in to discord.com either.

## Why the Discord app can't do the login for us

- Discord deep links OAuth into its app only for the `bot` / `applications.commands` scopes (adding an app to a
  server). A plain `identify` login stays on the web page on purpose: the result has to come back to the exact
  browser tab that started it, and the app can't know which browser that was
  ([discord-api-docs#7259](https://github.com/discord/discord-api-docs/discussions/7259), Nov 2024).
- The app-based flow in the Social SDK ([account linking on mobile](https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-on-mobile))
  returns to a `discord-<appId>:/authorize/callback` custom scheme, which only an **installed** native app can
  register. A web page can't (browsers only let pages register `web+` schemes, and not on iOS). Unity WebGL, App
  Clips (no custom schemes) and Android Instant Apps (being retired) don't get around it.
- A `discord://-/oauth2/authorize` link from the login page is undocumented for `identify`, may stop working at any
  time, and at best lands the login in the default browser rather than the tab that asked.

## The flow

The player gets a one-time code from our bot **in the Discord app**, where they're already signed in, and types it
into the login page **in their own browser**, so the session lands where they are.

1. On a phone, the login page leads with **Log in with the Discord app**: a link to the login channel
   (`https://discord.com/channels/<guild>/<channel>`, which the app does claim as a universal link). It must be a
   tapped link: a redirect won't reliably open the app on iOS.
2. In the channel, a pinned bot message has a **Get a login code** button (a `/login` slash command can do the same).
3. The bot replies **ephemerally** (only the tapper sees it) with a 6-digit code, valid ~5 minutes, plus a one-tap
   login link for anyone browsing inside Discord.
4. The player switches back (iOS shows "◀ Safari") and types the code into the login page. They're logged in.

The web "Log in with Discord" button stays for desktop and anyone who prefers it.

### Rejected: the site shows the code and you type it into Discord

This is the device-code / TV-login direction. The user does the same amount of work, but it needs pending-login state
the page polls on, plus a Discord modal to take the code. It can also be phished: an attacker starts a login and gets
someone to approve the attacker's code.

## Server

- **Interactions endpoint** `POST /api/discord/interactions`: HTTP interactions, no gateway connection or always-on
  bot process.
  - Verify the `X-Signature-Ed25519` / `X-Signature-Timestamp` headers against the application's public key
    (`DISCORD_PUBLIC_KEY`) on the raw body. Answer `PING` with `PONG`.
  - On the button's `MESSAGE_COMPONENT` interaction (and the `/login` command), read the Discord user from
    `member.user`. Upsert them the same way a real login does (`upsertLoginUser`: `username`, `global_name`,
    `avatar`, and the guild nick from `member.nick`, `inGuild: true`). Mint a code and reply with type 4 and
    `flags: 64` (ephemeral).
- **Login codes table**:
  - columns `code_hash`, `user_id`, `expires_at`, `used_at`, `created_at`;
  - store a hash, never the code;
  - one live code per user: a new one replaces the old.
- **`POST /auth/code`** `{ code }`:
  - rate-limit wrong guesses per session/IP (e.g. 5 per 10 minutes);
  - look up the unexpired, unused hash, mark it used, then `req.login(user)`, the same session machinery as OAuth.
- **`GET /auth/code/:token`**: the one-tap link. Show a confirm page and log in on POST, so link previewers can't use
  up the one-time link.
- **Rate limits**: at most a few codes per Discord user per 10 minutes.
- **Posting the button**: a one-off admin action (or a script) posts the message with the button to the login
  channel, using the bot token.

## Client

- On the login page, below `md`, a **Log in with the Discord app** button (the channel link) and a 6-digit code
  input with `inputmode="numeric"` and `autocomplete="one-time-code"`. The web OAuth button stays as the fallback.

## Setup (Discord admin)

- Add a bot user to the existing Discord application.
- Set its Interactions Endpoint URL to `https://<site>/api/discord/interactions`.
- Invite it to the clan server with **Send Messages** in the login channel only.
- Pick the login channel.
- New env vars: `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` (the token is only for posting the button message),
  `DISCORD_LOGIN_CHANNEL_ID`.

## Open questions

- Which channel: a new `#bingo-login`, or an existing bingo channel?
- A `/login` slash command as well as the button? It's cheap. It could also be a user-installable command that works
  in DMs.
