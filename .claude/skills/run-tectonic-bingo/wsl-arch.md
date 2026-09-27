# Tectonic Bingo on WSL (Arch Linux)

Commands for an Arch Linux distro under WSL2, in bash or zsh from the repo
root. [`SKILL.md`](SKILL.md) has the shared parts: what each step is for,
the variables, the driver commands, the gotchas. Anything that installs
outside the repo is the user's to run: ask them with the exact command, as
SKILL.md's "Ask, don't install" says.

## Prerequisites

Check each; when one is missing, ask the user to run the command shown,
then re-check.

**Node.js 20+ and npm**: `node -v && npm -v`. Missing or older:
`! sudo pacman -S --needed nodejs npm`.

**Tools the commands below use**: `command -v setsid fuser ldd`. `fuser`
comes from `psmisc` and `setsid` from `util-linux`; if either is missing:
`! sudo pacman -S --needed psmisc util-linux`.

**Playwright's Chromium, and its system libraries.** Needs the repo's npm
dependencies (Setup below) first. Then:

```bash
node .claude/skills/run-tectonic-bingo/driver.mjs --check
```

- `chromium OK: ...`: done.
- `Playwright's Chromium isn't installed`: ask the user to run
  `! npx playwright install chromium` (downloads Chrome for Testing into
  `~/.cache/ms-playwright`, a few hundred MB, once).
- `Chromium can't start: missing shared libraries`: see the next section.

### Chromium's system libraries

Playwright's `install-deps` only knows apt, so on Arch the libraries come
from pacman. The check lists each missing library with its Arch package and
prints the `sudo pacman -S --needed ...` line for exactly those; ask the
user to run that line. The full set chrome-headless-shell needs, for
reference:

```
! sudo pacman -S --needed nspr nss at-spi2-core libxcomposite libxdamage libxfixes libxrandr libxrender libxi libxkbcommon libdrm mesa alsa-lib
```

Re-run `--check` until it prints `chromium OK`. A library the check can't
place: `pacman -F <library>` names its package (after `sudo pacman -Fy`,
which the user runs).

## Setup

```bash
npm install
npm rebuild better-sqlite3 sharp onnxruntime-node
node -e "const D=require('better-sqlite3'); new D(':memory:'); console.log('OK')"
```

npm 11 skips dependency install scripts unless they're allowed (`npm warn
allow-scripts ... packages have install scripts not yet covered by
allowScripts`), so the native modules need the `npm rebuild`. The last line
prints `OK` once `better-sqlite3` works; without it the server only fails
later, when it opens the DB.

## Run

Seed, optionally add the demo bingo, start both servers in their own
sessions (so Stop can end the whole process tree), and wait for them.
Logs and pid files go in `/tmp`.

```bash
node e2e/prepare-db.cjs
DB_PATH="$(pwd)/server/data/e2e.db" npm run db:seed:dev --workspace=server   # optional demo bingo

PORT=3101 DB_PATH="$(pwd)/server/data/e2e.db" DEV_LOGIN_ENABLED=true \
  DISCORD_CLIENT_ID=e2e DISCORD_CLIENT_SECRET=e2e DISCORD_GUILD_ID=e2e \
  DISCORD_CALLBACK_URL=http://localhost:5273/auth/discord/callback \
  SESSION_SECRET=e2e-secret CLIENT_URL=http://localhost:5273 \
  TECTONIC_API_URL= TECTONIC_API_KEY= TECTONIC_GUILD_ID= WOM_API_KEY= RUNEPROFILE_API_KEY= \
  PLAYER_STATS_FETCH_DISABLED=true SCREENSHOT_OCR_DISABLED=true OSRS_ITEM_SEARCH_DISABLED=true GE_PRICES_FETCH_DISABLED=true \
  setsid npm run dev --workspace=server > /tmp/tb-server.log 2>&1 < /dev/null &
echo $! > /tmp/tb-server.pid

VITE_PORT=5273 VITE_API_TARGET=http://localhost:3101 \
  setsid npm run dev --workspace=client > /tmp/tb-client.log 2>&1 < /dev/null &
echo $! > /tmp/tb-client.pid

node .claude/skills/run-tectonic-bingo/driver.mjs --wait http://localhost:3101/api/bingos http://localhost:5273
```

A `TIMEOUT` means a server didn't come up: read `/tmp/tb-server.log` or
`/tmp/tb-client.log`. Busy ports: `ss -ltnp | grep -E ':(3101|5273)\b'`
shows what holds them; pick other ports as SKILL.md says, and use them in
the Stop commands too.

**Drive** with a heredoc:

```bash
node .claude/skills/run-tectonic-bingo/driver.mjs <<'EOF'
launch
nav /
dev-login e2e-admin
ss 01-home
quit
EOF
```

(Other ports: prefix it with `API_URL=http://localhost:<server port>
APP_URL=http://localhost:<client port>`.)

## Stop

End each server's whole process group, then make sure the ports are free:

```bash
kill -- -"$(cat /tmp/tb-server.pid)" -"$(cat /tmp/tb-client.pid)" 2>/dev/null
rm -f /tmp/tb-server.pid /tmp/tb-client.pid
fuser -k 3101/tcp 5273/tcp 2>/dev/null; true
```

`fuser -k <port>/tcp` alone also frees a port whose pid file is gone (a
server started some other way), but can leave the `npm`/`tsx watch`
parents behind.

## Troubleshooting

- **`error while loading shared libraries: libnspr4.so`** (or any `.so`),
  from `launch`, `--check` or the e2e suite: Chromium's system libraries are
  missing; see "Chromium's system libraries" above.
- **`Executable doesn't exist at ~/.cache/ms-playwright/...`**: Playwright's
  Chromium isn't installed, or was installed for a different Playwright
  version. Ask the user to run `! npx playwright install chromium`.
- **`Could not locate the bindings file`** / `better-sqlite3` binding
  errors: the native modules weren't built. Run the `npm rebuild` line in
  Setup. If the rebuild itself fails compiling (no prebuilt binary for this
  Node version), it needs a C++ toolchain; ask the user to run
  `! sudo pacman -S --needed base-devel python`, then rebuild again.
- **`EADDRINUSE`** on start: something still listens on the port. Run Stop;
  if the port is held by something you didn't start, use other ports rather
  than killing it.
- **`SqliteError: no such table: users`**: `DB_PATH` was relative; see
  SKILL.md's Gotchas.
