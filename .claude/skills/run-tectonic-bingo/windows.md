# Tectonic Bingo on Windows

Commands for native Windows in PowerShell, from the repo root.
[`SKILL.md`](SKILL.md) has the shared parts: what each step is for, the
variables, the driver commands, the gotchas. Anything that installs outside
the repo is the user's to run: ask them with the exact command, as
SKILL.md's "Ask, don't install" says.

**Shell.** Blocks marked `powershell` need PowerShell. If your shell tool is
Git Bash, the `node` and `npm` lines run there unchanged (drive the driver
with a bash heredoc); save each PowerShell-only block to a `.ps1` file in
your temp dir and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <file>`.

## Prerequisites

Check each; when one is missing, ask the user to run the command shown,
then re-check.

**Node.js 20+ and npm**: `node -v; npm -v`. Missing or older:
`! winget install OpenJS.NodeJS.LTS`, then the user restarts the terminal
(or Claude Code) so the new `PATH` is picked up.

**Playwright's Chromium.** Needs the repo's npm dependencies (Setup below)
first. Then:

```
node .claude/skills/run-tectonic-bingo/driver.mjs --check
```

`chromium OK: ...` means done. `Playwright's Chromium isn't installed`: ask
the user to run `! npx playwright install chromium` (downloads Chrome for
Testing into `%LOCALAPPDATA%\ms-playwright`, a few hundred MB, once).
Windows needs no extra system libraries for it.

## Setup

```
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

**Seed**, and optionally add the demo bingo:

```powershell
node e2e/prepare-db.cjs
$env:DB_PATH = (Resolve-Path server\data\e2e.db).Path; npm run db:seed:dev --workspace=server; Remove-Item Env:DB_PATH
```

**Start** both servers in the background, then wait for them:

```
node .claude/skills/run-tectonic-bingo/windows-start-servers.mjs
node .claude/skills/run-tectonic-bingo/driver.mjs --wait http://localhost:3101/api/bingos http://localhost:5273
```

`windows-start-servers.mjs` sets SKILL.md's variables and starts
`npm run dev --workspace=server` and `--workspace=client` hidden, logging to
`%TEMP%\tb-server.log` / `%TEMP%\tb-client.log` and writing their pids to
`%TEMP%\tb-server.pid` / `%TEMP%\tb-client.pid` for Stop. It exists because
PowerShell deletes a variable assigned `''`, and the run path needs some
set to empty (see SKILL.md). Other ports: pass them as arguments,
`windows-start-servers.mjs <server port> <client port>`.

A `TIMEOUT` means a server didn't come up: read the logs
(`Get-Content $env:TEMP\tb-server.log -Tail 40`). To see what holds a port:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3101,5273 -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess, @{n='Process'; e={(Get-Process -Id $_.OwningProcess).ProcessName}}
```

**Drive** by piping a here-string:

```powershell
@'
launch
nav /
dev-login e2e-admin
ss 01-home
quit
'@ | node .claude/skills/run-tectonic-bingo/driver.mjs
```

Screenshots land in `%TEMP%\shots\`. Other ports: first
`$env:API_URL = 'http://localhost:<server port>'; $env:APP_URL = 'http://localhost:<client port>'`.

## Stop

End each server's whole process tree (`npm` runs the real listener as a
grandchild), then make sure the ports are free:

```powershell
foreach ($name in 'server', 'client') {
  $pidFile = Join-Path $env:TEMP "tb-$name.pid"
  if (Test-Path $pidFile) { taskkill /T /F /PID (Get-Content $pidFile) 2>$null; Remove-Item $pidFile }
}
Get-NetTCPConnection -State Listen -LocalPort 3101,5273 -ErrorAction SilentlyContinue |
  ForEach-Object { taskkill /T /F /PID $_.OwningProcess 2>$null }
```

The second part also frees a port whose pid file is gone. Only run it on
ports you started servers on; use your own ports if you changed them.

## Troubleshooting

- **`npm.ps1 cannot be loaded because running scripts is disabled`**:
  PowerShell's execution policy blocks npm's `.ps1` shim. Call `npm.cmd`
  (and `npx.cmd`) instead, or ask the user to allow local scripts:
  `! Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`Executable doesn't exist at ...\ms-playwright\...`**: Playwright's
  Chromium isn't installed, or was installed for a different Playwright
  version. Ask the user to run `! npx playwright install chromium`.
- **`better-sqlite3` binding errors** (`Could not locate the bindings
  file`, `was compiled against a different Node.js version`): run the `npm
  rebuild` line in Setup. If the rebuild fails compiling (no prebuilt
  binary for this Node version), it needs the Visual C++ build tools; ask
  the user to run
  `! winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`,
  then rebuild again.
- **Servers die as soon as the start command returns**: your shell tool
  ends the processes it started. Start them from a separate terminal
  instead: ask the user to run the Start lines in their own PowerShell
  window.
- **`EADDRINUSE`** on start: something still listens on the port. Run Stop;
  if the port is held by something you didn't start, use other ports rather
  than killing it.
- **`SqliteError: no such table: users`**: `DB_PATH` was relative; see
  SKILL.md's Gotchas (the stray DB is `server\server\data\e2e.db*`).
