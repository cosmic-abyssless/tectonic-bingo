# infra/: the server as code (OpenTofu)

Everything about the machine that a person used to click together: the Hetzner server, its address and firewall, the three key
pairs, the GitHub deploy key and Actions secrets, the R2 backup bucket with its token, and the app's own settings and secrets.
The reasoning, and what is deliberately **not** here, is in [`docs/infrastructure-as-code-plan.md`](../docs/infrastructure-as-code-plan.md). Short
version of the limits: DNS stays with Mico by hand, and Discord's redirect URIs stay manual. The app's secrets live in Bitwarden
and reach the box through OpenTofu ("App settings and secrets" below, and [`docs/secrets-plan.md`](../docs/secrets-plan.md)).

| File | What it holds |
| --- | --- |
| `versions.tf` | OpenTofu and provider versions, pinned |
| `backend.tf`, `backend.hcl` | state in a private R2 bucket, encrypted by OpenTofu with a passphrase |
| `variables.tf`, `terraform.tfvars.example` | everything that varies (server type, location, admin keys, ...) |
| `keys.tf` | the CI key, the box's repository key and the server's SSH host key |
| `hetzner.tf` | the primary IP (survives rebuilds), the firewall, the server and its first boot |
| `cloud-init.yaml.tftpl` | what the server does on first boot: bootstrap, the backup env files, the front door |
| `github.tf` | the read-only deploy key and the four Deploy-workflow secrets |
| `r2.tf` | the backup bucket, a token that can reach only it, the derived S3 credentials |
| `app-env.tf` | the app's settings and secrets: `staging.env`, `production.env` and `staging.basic-auth`, rendered |
| `outputs.tf` | the address, the host key, the DNS records to ask for, the rendered env files (sensitive) |
| `env.ps1` | sets the credentials and app secrets for one PowerShell window, from Bitwarden (or asks, hidden) |
| `push-backup-env.ps1`, `push-backup-env.sh` | write the two `*.backup.env` files onto the box from tofu's outputs (PowerShell for Windows; bash + `jq` elsewhere) |
| `push-env.ps1`, `push-env.sh` | check, then write, the app's env files and staging's password onto the box (`env-sync.sh` is their half that runs on the box; `test-env-sync.sh` tests it) |

## What you need once

Nothing here is ever written to a file or pasted into chat. Keep every value in Bitwarden, as an item `env.ps1` can read
("App settings and secrets" below says how).

1. **Hetzner API token.** Console > the project > Security > API tokens > Generate, **Read & Write**. (`HCLOUD_TOKEN`)
2. **Cloudflare user token.** Profile > API Tokens > Create Token > Custom: **Account: Workers R2 Storage: Edit** and **User:
   API Tokens: Edit** (tofu makes the bucket-scoped backup token itself). (`CLOUDFLARE_API_TOKEN`)
3. **GitHub fine-grained token.** Settings > Developer settings > Fine-grained tokens, only this repository, permissions
   **Administration: Read and write** (deploy keys) and **Secrets: Read and write** (Actions secrets). (`GITHUB_TOKEN`)
4. **The state bucket, by hand** (state cannot create the place it is stored). R2 > Create bucket `tectonic-tofu-state`, then an
   R2 API token with **Object Read & Write** limited to that bucket only. Its key pair is `AWS_ACCESS_KEY_ID` and
   `AWS_SECRET_ACCESS_KEY` (the S3 names, because the backend speaks S3).
5. **A state passphrase**, 16+ characters, from the password manager. It encrypts the state; without it the state is
   unreadable (the infrastructure can still be rebuilt from scratch, nothing in state is unrecoverable). (`TF_VAR_state_passphrase`)
6. **`terraform.tfvars`** (ignored by git): copy `terraform.tfvars.example`, put your admin public key
   (`Get-Content ~\.ssh\tectonic_box.pub`) in `admin_public_keys`, and fill in the app's settings at the end.
7. **The app's secrets** in Bitwarden, and the Bitwarden CLI ("App settings and secrets" below).

Then, in PowerShell from the repository root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass   # Windows blocks scripts by default; this window only
. .\infra\env.ps1                     # reads the secrets above from Bitwarden (-Prompt to type them); this window only
cd infra
tofu init "-backend-config=backend.hcl" # connects to the encrypted state
tofu plan                             # what would change: read it
```

## Everyday commands

```powershell
tofu plan                      # always first
tofu apply                     # after reading the plan
tofu output known_hosts_line   # non-secret outputs; `tofu output -json backup_env` shows a secret one
.\push-env.ps1                 # after an apply that changed the app's settings: check, then -Write (below)
```

`tofu fmt -recursive` before committing. CI runs `tofu fmt -check`, `tofu validate` and `test-env-sync.sh` (no credentials
needed).

## App settings and secrets

The app's own files on the box, `/srv/tectonic/env/staging.env`, `production.env` and `staging.basic-auth`, are rendered by
`app-env.tf` and written by `push-env`. Nobody edits them on the box. Every value has one home:

| Value | Its home |
| --- | --- |
| Secrets (Discord client secret, both `SESSION_SECRET`s, the staging password, the clan, WOM and RuneProfile API keys) | Bitwarden, one item each, read by `env.ps1` as `TF_VAR_*` |
| Settings that aren't secret but stay out of this public repository (Discord ids, the clan API's address and guild, the User-Agent contact) | `terraform.tfvars` |
| Everything else (addresses, `NODE_ENV`, the switches that keep staging off the live APIs, Sentry) | `app-env.tf`, reviewed like code |

Tofu keeps a copy in its state, which is encrypted (`backend.tf`), and `tofu plan` shows *that* a secret changed, never its value.
The containers read the files when they start, so a pushed change reaches an environment with its next deploy (zero-downtime as
always); nothing running is ever touched.

**Changing a value, or rotating a secret:**

```powershell
. .\infra\env.ps1                 # after changing the item in Bitwarden (or terraform.tfvars, or app-env.tf)
cd infra
tofu plan                         # names what changes, never a value
tofu apply
.\push-env.ps1                    # check: lists, by name only, what differs from the box
.\push-env.ps1 -Write             # write (each old file is kept as FILE.bak)
```

Then deploy the environment (Actions > Deploy). Changing a `SESSION_SECRET` signs everyone out of that environment. Changing
the staging password: `push-env` notices the live site refuses the new one and leaves `staging.basic-auth` alone unless you
pass `-NewStagingPassword`. On Linux or macOS: `bash infra/push-env.sh [--write]`, with `jq` and `curl`.

**Adding a secret:** in the same pull request as the code that needs it:

1. Add a `sensitive` variable with no default to `app-env.tf`, and its line in the environments that use it. Leave it as `""`
   in the other one, as the clan keys are on staging.
2. Add it to the list in `env.ps1`.
3. Create the Bitwarden item `tectonic-bingo/TF_VAR_<name>`.

Then `apply`, push and deploy. Forgetting the value fails loudly: `tofu plan` stops with "No value for required variable" before
anything reaches the box. A setting that isn't secret is just a line in `app-env.tf`.

**Bitwarden, once per machine:** install the CLI (`winget install Bitwarden.CLI`, or `npm i -g @bitwarden/cli`) and run
`bw login`. Each value is an item named `tectonic-bingo/<NAME>`, holding the value as its password, for every name in
`env.ps1`'s list. Those are the six login values above plus the seven app secrets. `env.ps1` asks for the master password once
(`bw unlock`); it asks for any item it can't find by hand, and says which. Run `bw lock` when you're done.

### Moving the box onto this (once)

The box's files were typed in by hand before `app-env.tf` existed. The move proves OpenTofu would write exactly what's there,
before writing anything.

1. **Bitwarden:** make sure there's an item for each secret, holding the value the box **actually has**. The session secrets
   and the staging password were generated on the box, so copy them from there into Bitwarden. Run this as the deploy user,
   and paste each value straight into Bitwarden:
   `sed -n 's/^SESSION_SECRET=//p' /srv/tectonic/env/staging.env` (and `production.env`).
   The staging password is already in the password manager; only its hash is on the box.
2. **`terraform.tfvars`:** add the six settings from `terraform.tfvars.example`, copying the values from
   `/srv/tectonic/env/production.env`.
3. `. .\infra\env.ps1`, then `cd infra`, `tofu plan`. It should add only the two `terraform_data` resources for the staging
   password. Then `tofu apply`.
4. **Staging:**
   1. Run `.\push-env.ps1 -Only staging` until it says `0 different` and "staging password: logs in". Each difference is a
      Bitwarden or tfvars value that doesn't match the box: fix the value, not the box. Keys "only on the box" are kept as they
      are when it writes. If one should be managed (a setting added by hand, say), add it to `app-env.tf` first.
      `staging.basic-auth: changes` is expected the first time (a new hash for the same password).
   2. Then `.\push-env.ps1 -Only staging -Write`, deploy staging, and check you can log in.
5. **Production:** `.\push-env.ps1 -Only production` until `0 different`, then `-Write`. The file is now identical, so nothing
   needs deploying; the next ordinary deploy reads it.

To undo before a deploy, put `FILE.bak` back. After one, put it back and roll back (`deploy/README.md`).

## Adopting what already exists

The first server was built by hand before this code existed. Two things are worth **adopting** rather than recreating, and
one thing must be removed first. Find each id with the provider's own CLI or API (`GET https://api.hetzner.cloud/v1/primary_ips`
with your token), then:

```powershell
tofu import hcloud_primary_ip.box <id>     # the address 5.161.101.213, so DNS and DEPLOY_HOST never change
tofu import cloudflare_r2_bucket.backups <account id>/tectonic-backups   # holds staging's replica already
```

(`tofu import -help` and the provider's import docs give the exact id format if it has changed.) The address is currently
`auto_delete = true`, so deleting the hand-built server would delete it too: apply **`tofu apply -target=hcloud_primary_ip.box`
first**, which sets `auto_delete = false`. The old **SSH key registered with Hetzner has the same public key** as the one tofu
registers, and Hetzner refuses duplicates, so delete the old key in the console (after the old server is gone).

## The rebuild drill (also how you rebuild after a hardware failure)

This is the acceptance test for all of the above: a server no human configured, on the same address.

1. Adopt the address (above), then `tofu apply -target=hcloud_primary_ip.box`.
2. Console: delete the hand-built server, then the old SSH key. Staging is down from here (nothing else depends on it yet).
3. `tofu apply`. It creates the keys, the deploy key and secrets on GitHub, the firewall, the server, the bucket token.
4. Wait for first boot: as root with your admin key, `tail -f /var/log/cloud-init-output.log` until "bootstrapped". If a step
   failed, the log says which; fix it and re-run that command (all are idempotent).
5. On your PC: `ssh-keygen -R 5.161.101.213` (the machine is new, but tofu gave it the same host key as before, so this
   normally prints nothing; run it anyway if ssh complains).
6. `.\infra\push-backup-env.ps1`, then `.\infra\push-env.ps1 -Write` (on Linux or macOS, the `.sh` twins with `jq` and `curl`). On a new
   box there's nothing to compare against, so it reports every setting as new, and staging's password check can't reach the site
   yet; both are expected.
7. **Actions > Deploy > Run workflow** for staging. Then check: `https://staging.tectonic.bingo` asks for the password and loads,
   `docker ps` on the box shows the app, `ocr`, Litestream and the backup service, and the backup service's first run says
   "database replication: current".
8. Also on the box: `cat /etc/docker/daemon.json` (log rotation) and `sudo ufw status` (SSH, 80, 443).

## If something goes wrong

- **`tofu plan` wants to replace the server.** Do not apply. `user_data` and `image` are ignored on purpose (a template edit
  must not destroy a running server); something else changed. Read what.
- **First boot failed quietly.** A server with nothing on it looks healthy from outside. Always read
  `/var/log/cloud-init-output.log` after `apply`; `push-backup-env.sh` refuses to run until the box leaves
  `/srv/tectonic/state/.bootstrapped`.
- **A token was pasted somewhere it should not have been.** Revoke it in its dashboard and make a new one. Nothing else needs
  to change; state does not contain the API tokens, only what tofu created.
- **Provider upgrades.** Versions are pinned (`versions.tf`). Bump one at a time and require an empty `tofu plan` afterwards; the
  Cloudflare provider's v5 rewrite changed resource names and schemas.
