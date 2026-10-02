# App secrets as code: Cloudflare Secrets Store, and what to do instead

> **THEORETICAL.** An investigation, not a decision. Nothing here is built. Written 2026-10-02 against
> `docs/infrastructure-as-code-plan.md` and the `infra/` module as they stand on main.

## The gap

`docs/infrastructure-as-code-plan.md` ("Secrets: what is where, and why") splits secrets three ways:

1. **Secrets tofu creates** (SSH keys, the R2 token): in tofu's state, which is encrypted and kept in R2.
2. **Secrets tofu logs in with** (Hetzner, Cloudflare, GitHub tokens): environment variables from the password manager,
   for the length of a run.
3. **The app's secrets**: kept out of tofu on purpose. `deploy/init-env.sh` generates the session secrets and the staging
   password on the box, and `deploy/fill-secrets.sh` asks a person for the rest, one value at a time, over SSH.

Kind 3 is the gap. Its values are the Discord client secret, `TECTONIC_API_KEY`, `WOM_API_KEY`, `RUNEPROFILE_API_KEY`,
`SESSION_SECRET`, the Sentry DSNs, the staging password, and the non-secret settings beside them. They exist only in the
password manager and in `/srv/tectonic/env/*.env` on the box. A rebuild means retyping them, and nothing records which
value the box has or when it changed.

## Cloudflare Secrets Store

### What it is

An account-level, encrypted store of named secrets, in **open beta**. In the current beta its limits are:

- one store per account;
- 100 secrets;
- 64 KB per value.

The Cloudflare provider we already pin (`~> 5.0`, 5.25 installed) has `cloudflare_secrets_store` and
`cloudflare_secrets_store_secret` (added in 5.20). A secret has a `name`, a `value` and `scopes` (e.g. `["workers"]`).

### The two facts that decide it

1. **Values are write-only.** "Once a secret is added to the Secrets Store, it can no longer be decrypted or accessed via
   API or on the dashboard." Not by tofu, not by an API token, not by a person.
2. **Only Cloudflare products can read them.** Today that means **Workers** (through a binding,
   `await env.MY_SECRET.get()`) and **AI Gateway**. "Integrations with other products will be added in the future."

Our app is a Node container on a Hetzner box, not a Worker. **Nothing on the box can read a Secrets Store secret
directly.**

### What it would take anyway: a broker Worker

The only way to get a value to the box is a Worker that reads its bindings and hands them over.

- **The store:** `cloudflare_secrets_store` holds one `cloudflare_secrets_store_secret` per app secret and environment,
  e.g. `staging_DISCORD_CLIENT_SECRET`. Each `value` comes from a `TF_VAR_*` set from the password manager.
- **The Worker:** a `cloudflare_workers_script` binds every one of them and serves `GET /env/staging` and
  `GET /env/production` as an env file. It needs a route on a hostname we control: a Cloudflare zone (Mico's
  `tectonic.bingo`, if he delegates a token) or a `workers.dev` subdomain.
- **On the box:** at deploy time, `deploy.sh` fetches its environment's file from the Worker and writes
  `/srv/tectonic/env/<env>.env` before starting the container.
- **Locking the Worker down** (it serves every secret we have to anyone who gets past it), all of:
  - a **Cloudflare Access service token**, as headers;
  - the request's `CF-Connecting-IP` must match the box's address, which tofu knows;
  - one token per environment, so staging can't read production's file.

**What that buys:** app secrets declared in code, and versioned changes. A rebuild becomes `tofu apply` plus a deploy,
with no `fill-secrets.sh`.

**What it costs:**

- **The bootstrap problem only moves.** The box still needs a secret to fetch the others (the Access service token), so
  something still writes a credential onto the box, e.g. `push-backup-env.sh`'s path. We'd trade about ten values for
  one, plus a whole new service that hands out all of them.
- **A new attack surface:** an internet-facing endpoint whose only job is to return our secrets. Today they never leave
  the box or the password manager.
- **A new failure mode:** a deploy depends on Cloudflare Workers and Access being up, and on the Worker being correct.
- **The values still pass through tofu.** A secret's `value` is a tofu input, so it sits in tofu state like kind 1. That's
  acceptable since state is encrypted, but it means Secrets Store adds nothing state didn't already give us.
- **Beta.** Limits and API may change; the provider support is four months old.
- **More tokens and scope:** the Cloudflare token needs Secrets Store, Workers Scripts and Access permissions on top of
  R2 and API Tokens; a route needs a zone token from Mico.

**Effort:** about two days: the Worker, Access, `deploy.sh` changes, the drill, and docs. It also needs Mico for a zone
token, or a `workers.dev` route.

**Verdict:** not worth it today. Secrets Store is built for secrets that Workers use. For a box-hosted app it gives no
more than the encrypted state we already have, at the price of a secret-serving endpoint. Revisit if the app moves onto
Workers, or if Cloudflare ships a way for an external host to read secrets, e.g. Tunnel or a machine identity.

## What to do instead

### Recommended: app secrets as sensitive tofu variables, pushed like the backup credentials

This extends the one pattern we already have for kind-3 files: `infra/push-backup-env.sh` reads `tofu output` and writes
`*.backup.env` over SSH with the admin key.

1. **Variables:** in `infra/app-env.tf`, one `sensitive = true` variable per secret per environment, e.g.
   `staging_discord_client_secret`. Values come from `TF_VAR_*` set from the password manager, the way the login tokens
   already do (`infra/env.ps1`).
2. **Generated secrets:** `SESSION_SECRET` and the staging basic-auth password become `random_password` resources. Tofu
   generates them once, keeps them in state, and only rotates them on a `-replace`. `init-env.sh` stops generating them.
3. **Settings:** the non-secret settings (`CLIENT_URL`, `NODE_ENV`, the `*_DISABLED` switches, Sentry environment) become
   plain locals per environment. That's the code-reviewed part.
4. **Outputs:** two `sensitive` outputs, `staging_env` and `production_env`, render whole env files from the variables
   and locals in the format `deploy/env/*.env.example` documents.
5. **Pushing:** `infra/push-env.sh` (alongside `push-backup-env.sh`, or merged into one `push-env.sh`) writes them over SSH.
   It trusts the host key from tofu's output, writes atomically and `chmod 600`.
6. **Retirement:** `fill-secrets.sh` goes, or stays only as a fallback, and the runbook's rebuild becomes `tofu apply`
   then `infra/push-env.sh` then Deploy.

**What it buys:**
- every app setting in code, with the secret ones in encrypted state;
- a rebuild with no retyping;
- `tofu plan` shows *that* a secret changed (never its value);
- rotation is change the password manager entry, `tofu apply`, push, redeploy.

**What it costs:**
- the app's secrets join kind 1 in state, so the state passphrase guards everything. That's already true for the R2
  token and the deploy keys;
- whoever runs tofu needs every app secret in their environment. A `infra/env.ps1` that pulls them from the password
  manager's CLI makes that one command.

**Effort:** about half a day, plus a drill on staging, and no new service.

**Note on cloud-init:** the plan's reason for keeping app secrets out of cloud-init still holds. This pushes them over
SSH after boot; they never go in `user_data`.

### Alternative: SOPS-encrypted env files

Encrypt `deploy/env/staging.env` and `production.env` with [SOPS](https://github.com/getsops/sops) and an age key, and
commit the encrypted files. Tofu can read them with the `carlpett/sops` provider, or the box can decrypt them with its
own age key.

- **For:** secrets reviewed and versioned in git, and readable diffs of which keys changed.
- **Against:** a public repository would carry our encrypted secrets forever, so rotating the age key doesn't un-leak old
  commits. It's also one more key to guard and one more tool for both admins.

Better suited to a private repo; ours is public.

### Alternative: a password manager with a machine identity

1Password Connect/Service Accounts or Bitwarden Secrets Manager let the box (or the deploy workflow) fetch secrets with
its own scoped token. The password manager becomes the single source, with no copy in state.

- **For:** one source of truth that people already use, and per-machine access you can revoke.
- **Against:** depends on which password manager the team uses and its plan; it adds a runtime dependency to deploys;
  and the machine token is again a bootstrap secret on the box.

## Recommendation

Skip Cloudflare Secrets Store for now. If closing the gap is worth half a day, do the sensitive-variables plan:

- it reuses the encrypted state, the env-var login and the push-over-SSH pattern we already trust;
- it adds no new service or endpoint;
- it turns a rebuild's "retype ten secrets" into one command.

### Open questions for the maintainers

- **Password manager:** which one, and does it have a CLI? That decides how `infra/env.ps1` loads the values.
- **Staging's own secrets:** should staging get its own Discord application? Today both environments share one, and
  `fill-secrets.sh` writes it to both.
- **Rotation:** move to "change it in the password manager, apply, push", or keep rotation a manual edit on the box?
