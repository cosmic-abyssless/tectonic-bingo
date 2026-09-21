# Railway infrastructure and deploys

`railway.ts` describes this repo's service on Railway ("Bingo Website": what it builds from, how it starts, its health
check, domains, and the volume holding SQLite and uploads). It manages **only** that service, in the shared "Tectonic"
project (Mico's workspace), whose other services (bot, API, Postgres, sync, website) come from other repos.

## The rule that matters: keep `partial`

`export const partial = "bingo-website"` scopes the file to its own slice of the project. Without it, `railway config
apply` treats the file as the whole project and **plans to delete every other service, Postgres included**. That was
seen in a plan while building this. So:

- Never remove or rename `partial`.
- Always read the plan before applying. If it says anything is destroyed, stop.
- Don't use `--confirm-destructive`.

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

1. Work goes through a pull request. `ci.yml` builds, runs the server and client tests, and checks the migrations.
2. Merging to `main` runs CI again on the merge commit.
3. To deploy, run **Actions > Promote to production** (choose a commit, default `main`). It refuses unless CI passed on
   that exact commit, and only fast-forwards the `production` branch.
4. Railway deploys `production`. Migrations run on start. Each deploy takes the site down for a few seconds because
   SQLite lives on one volume (issue #75), so promote deliberately, not during a signup rush.

## One-time setup still needed

- **`RAILWAY_TOKEN`**: a Railway project token for the production environment (Railway > project > Settings > Tokens),
  saved as a repository secret. Needed only for the plan comment on pull requests. It can change the production project,
  so it needs the project owner's OK.
- **Deploying from this repo:** production still builds from `Miconen/tectonic-bingo` (branch `production`). To switch to
  `cosmic-abyssless/tectonic-bingo` (and make Railway wait for CI):
  1. Install the Railway GitHub app on this repo and let the Railway account see it.
  2. Run the promote workflow once so a `production` branch exists here.
  3. Change the `source` line in `railway.ts` to `github("cosmic-abyssless/tectonic-bingo", { branch: "production", checkSuites: true })`,
     read `railway config plan` (it should show only `source.repo` and `source.checkSuites`), then apply.
  This is prepared on the `railway/deploy-from-this-repo` branch. Do it only once the project owner agrees.

## Not managed here

Secret variable values (they stay in Railway; `preserve()` only lists the names), the `development` environment, and every
other service in the project.

The one thing set from code is the two Sentry DSNs (`SENTRY_DSN` for the server, `VITE_SENTRY_DSN` for the client), because a DSN is not
a secret. `SENTRY_AUTH_TOKEN` is a secret: set it by hand in Railway so the client build can upload source maps (see the Sentry
notes in `.env.example`).
