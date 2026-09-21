# Railway infrastructure and deploys

`railway.ts` describes this repo's service on Railway ("Bingo Website": what it builds from, how it starts, its health
check, domains, and the volume holding SQLite and uploads). It manages **only** that service, in the shared "Tectonic"
project (Mico's workspace), whose other services (bot, API, Postgres, sync, website) come from other repos.

## The rule that matters: keep `partial`

`export const partial = "bingo-website"` scopes the file to its own slice of the project. Without it, or with
`partial = true` instead of a name, `railway config apply` treats the file as the whole project and **plans to delete
every other service, Postgres included**. Both were seen in plans while building this. So:

- `partial` must stay a non-empty string. (The name itself doesn't matter; the string form does.)
- Always read the plan before applying. If it says anything is destroyed, stop.
- Don't use `--confirm-destructive`.

**Variables:** inside the service, a variable that is set in Railway but not listed in `railway.ts` is **deleted** by the
next apply (a plan shows it as `Delete variable`). `preserve()` on a name keeps its value and is a no-op if it isn't
set. So whenever a variable is added in the Railway dashboard, add `NAME: preserve()` here too, and read the plan for
`Delete variable` lines before applying.

## Preview and apply

Run these from the repo root, logged in with `railway login` and linked to the project (`railway link`, production).

```bash
railway config plan     # read-only; "already up to date" means the file matches Railway
railway config apply    # shows the plan and asks before changing anything
```

`railway config pull` imports the live project into a file. Use it only to look: it writes the whole project, not a partial.

**Windows:** the SDK checks the CLI version by running `railway`, which can't find npm's shim. Point it at the real
executable first (PowerShell):

```powershell
$env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"
```

Pull requests that touch `.railway/` get a plan comment from `.github/workflows/railway-plan.yml`, once a `RAILWAY_TOKEN`
secret exists (below). It only plans; applying is done by hand.

## How code reaches production

Railway builds the service from the `production` branch of `Miconen/tectonic-bingo`.

1. Work goes through a pull request into that repo's `develop` branch. `ci.yml` builds, runs the server and client
   tests, and checks the migrations.
2. A pull request from `develop` into `production` is the deploy. Railway deploys the merge as soon as it lands.
3. Migrations run on start. Each deploy takes the site down for a few seconds because SQLite lives on one volume
   (issue #75), so merge to `production` deliberately, not during a signup rush.

## Optional setup

- **`RAILWAY_TOKEN`**: a Railway project token for the production environment (Railway > project > Settings > Tokens),
  saved as a repository secret. Needed only for the plan comment on pull requests. It can change the production project,
  so it needs the project owner's OK.

## Not managed here

Secret variable values (they stay in Railway; `preserve()` only lists the names), the `development` environment, and every
other service in the project.

The one thing set from code is the two Sentry DSNs (`SENTRY_DSN` for the server, `VITE_SENTRY_DSN` for the client), because a DSN is not
a secret. `SENTRY_AUTH_TOKEN` is a secret: set it by hand in Railway so the client build can upload source maps (see the Sentry
notes in `.env.example`).
