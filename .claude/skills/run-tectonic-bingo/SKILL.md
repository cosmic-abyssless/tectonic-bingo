---
name: run-tectonic-bingo
description: Build, run, and drive Tectonic Bingo (Express + SQLite server, Vite/React client). Use when asked to start the app, run its dev server, take a screenshot of its UI, log in as a test user, or interact with the running app.
---

Tectonic Bingo is a browser web app: an Express/SQLite server (`server/`) and
a Vite/React client (`client/`). There's no `chromium-cli` in this
container, so it's driven via a small Playwright-core REPL at
`.claude/skills/run-tectonic-bingo/driver.mjs` — start the dev server, pipe
commands to the driver's stdin, read screenshots from `/tmp/shots/`.

All paths below are relative to the repo root.

## Prerequisites

This container is rootless Arch Linux with no `apt-get` and no working
`sudo` — `npx playwright install-deps` can't run here. Everything below
works without root:

```bash
npx playwright install chromium   # downloads Chrome for Testing, ~300MB, one-time
```

Chromium then fails to launch with `error while loading shared libraries:
libnspr4.so: cannot open shared object file`. `driver.mjs`'s `launch`
command fixes this itself the first time you call it, by running
`bootstrap-chromium-libs.sh` — which pulls the missing `.so` files straight
out of Arch package files via `pacman -Sp` (prints the current download URL;
no root, no local package-db write) + `curl` + `tar`, caches them in
`~/.cache/tectonic-bingo/chromium-libs/`, and points `LD_LIBRARY_PATH` at
that cache when spawning the browser. You don't need to run it by hand, but
it's safe to (idempotent):

```bash
bash .claude/skills/run-tectonic-bingo/bootstrap-chromium-libs.sh
```

**On a container with a real `apt-get` + `sudo`**, skip the above and run
`sudo npx playwright install-deps chromium` instead — untested here (no
apt on this box), but that's what the missing libs translate to on
Ubuntu/Debian: `libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2
libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2
libxrender1 libxi6 libgbm1 libasound2`.

## Setup

```bash
npm install
```

Native modules (`better-sqlite3`, `sharp`, `onnxruntime-node`) need their
install/build scripts, which `npm install` alone doesn't run in this
container's locked-down script policy — you'll see `npm warn allow-scripts
7 packages have install scripts not yet covered by allowScripts`. Fix:

```bash
npm rebuild better-sqlite3 sharp onnxruntime-node
```

Verify it worked (`better-sqlite3` throws a binding error otherwise, which
only surfaces once the server tries to open the DB):

```bash
node -e "const D=require('better-sqlite3'); new D(':memory:'); console.log('OK')"
```

## Run (agent path)

**1. Seed a database.** The e2e suite already has a script for this — builds
a fresh, fully-migrated SQLite DB and seeds `e2e-admin` + `e2e-p1..e2e-p5`
users:

```bash
node e2e/prepare-db.cjs
```

Optionally layer on a richer demo bingo (3x3 board, tiles, submissions in
every review state) on top of the same DB:

```bash
DB_PATH="$(pwd)/server/data/e2e.db" npm run db:seed:dev --workspace=server
```

**2. Start the server and client**, with dev-login enabled (the server's
`/auth/dev-login` route — gated behind `DEV_LOGIN_ENABLED=true` — logs a
browser session in as any seeded user by `discordId`, skipping real Discord
OAuth entirely):

```bash
PORT=3101 DB_PATH="$(pwd)/server/data/e2e.db" DEV_LOGIN_ENABLED=true \
  DISCORD_CLIENT_ID=e2e DISCORD_CLIENT_SECRET=e2e \
  DISCORD_CALLBACK_URL=http://localhost:5273/auth/discord/callback \
  DISCORD_GUILD_ID=e2e SESSION_SECRET=e2e-secret CLIENT_URL=http://localhost:5273 \
  TECTONIC_API_URL= TECTONIC_API_KEY= TECTONIC_GUILD_ID= WOM_API_KEY= RUNEPROFILE_API_KEY= \
  PLAYER_STATS_FETCH_DISABLED=true SCREENSHOT_OCR_DISABLED=true OSRS_ITEM_SEARCH_DISABLED=true GE_PRICES_FETCH_DISABLED=true \
  npm run dev --workspace=server > /tmp/tb-server.log 2>&1 &
disown

VITE_PORT=5273 VITE_API_TARGET=http://localhost:3101 \
  npm run dev --workspace=client > /tmp/tb-client.log 2>&1 &
disown

timeout 30 bash -c 'until curl -sf http://localhost:3101/api/bingos -o /dev/null -w "%{http_code}" | grep -qE "200|401"; do sleep 1; done'
timeout 30 bash -c 'until curl -sf http://localhost:5273 >/dev/null; do sleep 1; done'
```

Stop either by freeing its port before relaunching (`npm run dev` doesn't
forward signals to the real listener, so `kill %1` alone won't free it):

```bash
fuser -k 3101/tcp 2>/dev/null; fuser -k 5273/tcp 2>/dev/null
```

**3. Drive it.** Pipe a command script to the driver's stdin (this
container has no `tmux`; if yours does, `send-keys`/`capture-pane` into the
same `node driver.mjs` process works too — same command set):

```bash
node .claude/skills/run-tectonic-bingo/driver.mjs <<'EOF'
launch
nav /
dev-login e2e-admin
ss 01-home
click-text Demo Bingo
wait text=Rules
ss 02-demo-board
console --errors
quit
EOF
```

Screenshots land in `/tmp/shots/` (override: `SCREENSHOT_DIR`). First
`launch` call bootstraps the Chromium libs (see Prerequisites) and takes a
few extra seconds; later ones are instant.

### Driver commands

| command | what it does |
|---|---|
| `launch` | bootstrap libs if needed, launch headless Chromium, open a page |
| `nav [path\|url]` | navigate (relative paths resolve against `http://localhost:5273`) |
| `dev-login <discordId>` | POST `/auth/dev-login`, then reload `/` — `e2e-admin`, `e2e-p1`..`e2e-p5` after step 1 above |
| `ss [name]` | full-page screenshot → `/tmp/shots/<name>.png` |
| `click <css-sel>` | click via Playwright locator |
| `click-text <text>` | click the first element containing this text |
| `fill <css-sel> <text...>` | fill a form field |
| `type <text>` / `press <key>` | keyboard input |
| `wait <sel>` | wait up to 10s for a selector (`text=...` engine works too) |
| `eval <js>` | evaluate an expression in the page, print JSON |
| `text [css-sel]` | print `innerText` (whole body if no selector) |
| `console [--errors]` | print buffered browser console messages |
| `quit` | close the browser, exit |

## Run (human path)

```bash
npm run dev   # starts server (3001) + client (5173) via concurrently, Ctrl-C to stop
```

Needs a real root `.env` with `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/
`DISCORD_CALLBACK_URL`/`DISCORD_GUILD_ID`/`SESSION_SECRET`/`CLIENT_URL` set
(see `.env.example`) — a fresh worktree/checkout won't have one, since
`.env` is gitignored. And real Discord OAuth is required for login this
way — useless headless without also setting `DEV_LOGIN_ENABLED=true` and
using `/auth/dev-login` via curl, same as the agent path.

## Test

```bash
npm test              # server unit tests (vitest) - 60 files, 827 tests, ~13s
npm run test:e2e       # full Playwright e2e suite (own ports 3101/5273, own e2e.db)
```

## Gotchas

- **`DB_PATH` must be absolute.** `npm run dev --workspace=server` runs
  with `cwd` set to `server/`, so a relative `DB_PATH=./server/data/e2e.db`
  resolves to `server/server/data/e2e.db` — a fresh, migration-less DB with
  no `users` table, and every `/auth/dev-login` call then hangs/errors with
  `SqliteError: no such table: users`. Always pass an absolute path.
- **Client-side route changes don't satisfy `networkidle`.** `click-text`
  navigating within the SPA (e.g. into a bingo board) doesn't fire a
  document load, so a screenshot taken immediately after `click`/`click-text`
  can be blank — the fetch-and-render hasn't happened yet. Follow with
  `wait <selector-that-only-appears-once-loaded>` before `ss`.
- **`console --errors` accumulates for the whole session**, not per
  navigation. The pre-login `/api/me` 401 (expected — that's how the app
  detects you're logged out) stays in the buffer and shows up after later,
  successful navigations too. Don't treat old entries as new failures;
  check the timestamp of the action, not just whether the list is non-empty.
- **Running `driver.mjs` from outside the repo** (e.g. a script in `/tmp`)
  fails with `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright-core'`
  — Node resolves it from the importing file's own location, not `cwd`.
  Run it (or anything that imports it) from inside the repo tree.

## Troubleshooting

- **`error while loading shared libraries: libnspr4.so`**: Chromium's
  runtime deps aren't installed. Run `launch` in the driver (auto-fixes) or
  `bash .claude/skills/run-tectonic-bingo/bootstrap-chromium-libs.sh`
  directly. If it reports "no pacman on this system," you're on a
  non-Arch box — use the `apt-get` line in Prerequisites instead.
- **`npm warn allow-scripts ... 7 packages have install scripts not yet
  covered`**: native modules didn't build. Run `npm rebuild better-sqlite3
  sharp onnxruntime-node` (see Setup).
- **`SqliteError: no such table: users`** in the server log: `DB_PATH` was
  relative when the server started — see Gotchas. Kill the server (`fuser
  -k 3101/tcp`), delete the stray DB it created at
  `server/server/data/e2e.db*`, restart with an absolute `DB_PATH`.
- **`dev-login` returns 404**: `DEV_LOGIN_ENABLED` wasn't set to `true` (or
  `NODE_ENV=production`) when the server started — the route only exists
  under that gate (`server/src/devMode.ts`).
- **Server port already in use (`EADDRINUSE`)**: a previous run's server is
  still listening — `npm run dev`'s wrapper doesn't forward `kill` to the
  actual listener. Free it first: `fuser -k 3101/tcp` (or `5273` for the
  client).
