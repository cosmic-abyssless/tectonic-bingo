# Deploying Tectonic Bingo

How the site is packaged, run, deployed and backed up. The reasoning is in `docs/zero-downtime-deploy-plan.md`; this
folder is the how-to. It grows phase by phase, and everything needed to rebuild the server from nothing belongs here.

## The image

`Dockerfile` builds one image per commit. It contains the built client, the built server, the migrations and production
dependencies only. It is run unchanged in every environment: nothing environment-specific is baked in at build time.

The entrypoint picks a role from the first argument:

| Command | What the container does |
| --- | --- |
| `api` (default) | Applies pending migrations, then serves the site on port 8080. |
| `migrate` | Applies pending migrations and exits. |

Settings and secrets arrive as environment variables (`.env.docker.example` lists them). The browser gets its own Sentry
settings from the server when it loads the page (`window.__APP_CONFIG__`, see `server/src/runtimeConfig.ts`), which is
what lets the same image report as "staging" in one place and "production" in another.

Build arguments and secrets:

- `SENTRY_RELEASE` (build arg): the commit, used as the Sentry release name for the client's source maps.
- `sentry_auth_token` (BuildKit secret, optional): uploads the client's source maps. Never pass it as a build arg.

```bash
docker build --build-arg SENTRY_RELEASE=$(git rev-parse HEAD) \
  --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN -t tectonic-bingo:$(git rev-parse --short HEAD) .
```

## Running the whole stack locally

```bash
cp .env.docker.example .env.docker      # once; the defaults work for a local run
docker compose up --build               # then open http://localhost:8080
```

- The database and uploads live in `.docker-data/` (created on first run, ignored by git). To try the stack against
  realistic data, put a copy of a database at `.docker-data/sqlite/bingo.db` (use SQLite's `.backup`, not a file copy,
  if the source is being written to) and uploads in `.docker-data/uploads/`.
- With `NODE_ENV=development` and `DEV_LOGIN_ENABLED=true` (the example's defaults) the login page lists accounts to
  sign in as. The image itself defaults to `NODE_ENV=production`, where dev-login is off.
- Caddy is the front door (`Caddyfile`), the same one production uses. Locally it serves plain HTTP; in production
  `SITE_ADDRESS` is the domain and Caddy handles the certificate.
- Stop with `docker compose down`; add `-v` to also forget Caddy's certificates. The data directory is never removed.

## Migrations and zero-downtime deploys

Every deploy runs migrations while the previous version is still serving, so **a migration must be additive** (new
tables, new nullable or defaulted columns, new indexes). A change that removes or renames something needs two deploys:
add the new shape and deploy, move the data, then drop the old shape in the next deploy. Drizzle applies migrations in
the order of their journal timestamps and silently skips any dated earlier than one already applied, so migrations must
also be generated and merged in order.
