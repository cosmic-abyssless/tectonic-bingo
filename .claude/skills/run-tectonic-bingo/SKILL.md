---
name: run-tectonic-bingo
description: Build, run, and drive Tectonic Bingo (Express + SQLite server, Vite/React client) on native Windows or WSL (Arch Linux). Use when asked to start the app, run its dev server, take a screenshot of its UI, log in as a test user, or interact with the running app.
---

Tectonic Bingo is a browser web app: an Express/SQLite server (`server/`) and
a Vite/React client (`client/`). Agents drive it headless through a small
Playwright REPL, `.claude/skills/run-tectonic-bingo/driver.mjs`: start the
dev servers, pipe commands to the driver's stdin, read the screenshots it
saves.

This file is what's the same everywhere. The commands for installing,
starting and stopping live in one guide per environment. All paths are
relative to the repo root.

## 1. Pick your environment's guide

Run `node -p process.platform` (works in any shell):

| result | also check | environment | read |
|---|---|---|---|
| `win32` | | Windows (PowerShell) | [`windows.md`](windows.md) |
| `linux` | `uname -r` contains `microsoft` and `/etc/os-release` has `ID=arch` | WSL (Arch Linux) | [`wsl-arch.md`](wsl-arch.md) |
| anything else | | not covered | stop, see below |

Read the matching guide now and follow it; it points back here for the
shared parts. No `node` at all: on Windows or WSL, the guide's
Prerequisites say how to get it.

**Anything else** (macOS, a Linux other than Arch under WSL, Linux outside
WSL): tell the user this skill doesn't cover their environment, and stop.
List what the app needs so they can set it up themselves: Node.js 20+ with
npm, the repo's npm dependencies with their native modules built
(`better-sqlite3`, `sharp`, `onnxruntime-node`), Playwright's Chromium
(`npx playwright install chromium`) plus the system libraries it links
against, and free ports 3101 and 5273.

## Ask, don't install

The skill installs nothing outside the repo: no system packages, browsers
or libraries. When a check shows something missing, tell the user exactly
what's missing and the exact command, and ask them to run it (in Claude
Code they can type it prefixed with `!`, e.g. `! npx playwright install
chromium`). Wait for them, then re-run the check before going on. The
repo's own dependencies (`npm install`, `npm rebuild ...`) are normal setup
steps: run those yourself.

## The agent run path

The guides give the exact commands; this is what they do.

**1. Seed a database.** `node e2e/prepare-db.cjs` builds a fresh,
fully-migrated SQLite DB at `server/data/e2e.db` (replacing any old one)
and seeds the users `e2e-admin` and `e2e-p1`..`e2e-p5`. Optionally, `npm
run db:seed:dev --workspace=server` with `DB_PATH` set to that file's
**absolute** path adds a demo bingo (3x3 board, tiles, submissions in every
review state).

**2. Start the server and the client** in the background, logging to files,
with these environment variables:

| process | command | variables |
|---|---|---|
| server | `npm run dev --workspace=server` | `PORT=3101`, `DB_PATH=<absolute path to server/data/e2e.db>`, `DEV_LOGIN_ENABLED=true`, `DISCORD_CLIENT_ID=e2e`, `DISCORD_CLIENT_SECRET=e2e`, `DISCORD_GUILD_ID=e2e`, `DISCORD_CALLBACK_URL=http://localhost:5273/auth/discord/callback`, `SESSION_SECRET=e2e-secret`, `CLIENT_URL=http://localhost:5273`; set to empty: `TECTONIC_API_URL`, `TECTONIC_API_KEY`, `TECTONIC_GUILD_ID`, `WOM_API_KEY`, `RUNEPROFILE_API_KEY`; set to `true`: `PLAYER_STATS_FETCH_DISABLED`, `SCREENSHOT_OCR_DISABLED`, `OSRS_ITEM_SEARCH_DISABLED`, `GE_PRICES_FETCH_DISABLED` |
| client | `npm run dev --workspace=client` | `VITE_PORT=5273`, `VITE_API_TARGET=http://localhost:3101` |

`DEV_LOGIN_ENABLED=true` turns on the server's `/auth/dev-login` route, which
logs a browser session in as any seeded user by `discordId`, skipping real
Discord OAuth. The empty values beat any real ones in a root `.env` (dotenv
never overrides a variable that's already set, even to empty).

Then wait until both answer:

```
node .claude/skills/run-tectonic-bingo/driver.mjs --wait http://localhost:3101/api/bingos http://localhost:5273
```

**Other ports** (3101 or 5273 busy, e.g. another agent or the e2e suite is
running): pick two free ones and change them everywhere: `PORT`, the two
`5273` URLs in the server's variables, `VITE_PORT`, `VITE_API_TARGET`, and
give the driver `API_URL=http://localhost:<server port>` and
`APP_URL=http://localhost:<client port>`.

**3. Drive it.** Pipe a command script to the driver's stdin. Commands:

```
launch
nav /
dev-login e2e-admin
ss 01-home
click-text Demo Bingo
wait text=Rules
ss 02-demo-board
console --errors
quit
```

Screenshots land in `<os temp dir>/shots/` (`/tmp/shots` on Linux,
`%TEMP%\shots` on Windows; override with `SCREENSHOT_DIR`); `ss` prints the
full path. Read them with the Read tool.

**4. Stop both servers** when done (the guide's Stop section). `npm run dev`
doesn't pass signals on to the real listener, so stopping the shell job
alone leaves the port taken.

### Driver commands

| command | what it does |
|---|---|
| `launch` | check Chromium can run, launch it headless, open a page; exits non-zero naming what's missing |
| `nav [path\|url]` | navigate (relative paths resolve against `APP_URL`, default `http://localhost:5273`) |
| `dev-login <discordId>` | POST `/auth/dev-login` on `API_URL`, then reload `/`: `e2e-admin`, `e2e-p1`..`e2e-p5` |
| `ss [name]` | full-page screenshot to `<shots dir>/<name>.png` |
| `click <css-sel>` | click via Playwright locator |
| `click-text <text>` | click the first element containing this text |
| `fill <css-sel> <text...>` | fill a form field |
| `type <text>` / `press <key>` | keyboard input |
| `wait <sel>` | wait up to 10s for a selector (`text=...` works too) |
| `eval <js>` | evaluate an expression in the page, print JSON |
| `text [css-sel]` | print `innerText` (whole body if no selector) |
| `console [--errors]` | print buffered browser console messages |
| `quit` | close the browser, exit |

One-shot modes: `driver.mjs --check` (can Chromium run here? prints what's
missing, exit 0/1) and `driver.mjs --wait <url>...` (exit 0 once every URL
answers below 500, 1 after 60s).

## Run (human path)

`npm run dev` starts the server (3001) and client (5173) together; Ctrl-C
stops both. It needs a real root `.env` (see `.env.example`), which a fresh
checkout or worktree doesn't have, and real Discord OAuth to log in. Headless
agents use the agent path.

## Test

```
npm test            # server unit tests (vitest)
npm run test:e2e    # Playwright e2e suite: its own ports 3101/5273 and its own e2e.db
```

The e2e suite needs the same Chromium setup as the driver.

## Gotchas

- **`DB_PATH` must be absolute.** The server runs with `cwd` set to
  `server/`, so a relative `DB_PATH=./server/data/e2e.db` resolves to
  `server/server/data/e2e.db`: a fresh DB with no tables, and every
  `dev-login` then fails with `SqliteError: no such table: users`. Fix: stop
  the server, delete the stray `server/server/data/e2e.db*`, restart with an
  absolute path.
- **Client-side route changes don't wait for data.** A `click`/`click-text`
  that navigates inside the SPA fires no page load, so an immediate `ss` can
  be blank. Put `wait <selector-that-only-appears-once-loaded>` before `ss`.
- **`console --errors` accumulates for the whole session.** The pre-login
  `/api/me` 401 is expected (that's how the app detects you're logged out)
  and stays in the buffer; judge new errors by the action that caused them.
- **Run `driver.mjs` from inside the repo.** Node resolves `playwright-core`
  from the script's own location, so a copy of it elsewhere fails with
  `ERR_MODULE_NOT_FOUND`.
- **`dev-login` returns 404**: the server started without
  `DEV_LOGIN_ENABLED=true` (or with `NODE_ENV=production`); the route only
  exists behind that gate (`server/src/devMode.ts`). Restart it with the
  variables above.
