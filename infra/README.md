# infra/: the server as code (OpenTofu)

Everything about the machine that a person used to click together: the Hetzner server, its address and firewall, the three key
pairs, the GitHub deploy key and Actions secrets, and the R2 backup bucket with its token. The reasoning, and what is
deliberately **not** here, is in [`docs/infrastructure-as-code-plan.md`](../docs/infrastructure-as-code-plan.md). Short
version of the limits: DNS stays with Mico by hand, Discord's redirect URIs stay manual, and **the app's own secrets never
enter OpenTofu** (they are entered on the box with `deploy/fill-secrets.sh`).

| File | What it holds |
| --- | --- |
| `versions.tf` | OpenTofu and provider versions, pinned |
| `backend.tf`, `backend.hcl` | state in a private R2 bucket, encrypted by OpenTofu with a passphrase |
| `variables.tf`, `terraform.tfvars.example` | everything that varies (server type, location, admin keys, ...) |
| `keys.tf` | the CI key, the box's repository key and the server's SSH host key |
| `hetzner.tf` | the primary IP (survives rebuilds), the firewall, the server and its first boot |
| `cloud-init.yaml.tftpl` | what the server does on first boot: bootstrap, env files, the front door |
| `github.tf` | the read-only deploy key and the four Deploy-workflow secrets |
| `r2.tf` | the backup bucket, a token that can reach only it, the derived S3 credentials |
| `outputs.tf` | the address, the host key, the DNS records to ask for |
| `env.ps1` | asks for the credentials below with hidden input and sets them for one PowerShell window |
| `push-backup-env.sh` | writes the two `*.backup.env` files onto the box from tofu's outputs |

## What you need once

Nothing here is ever written to a file or pasted into chat. Keep every value in the team's password manager.

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
6. **`terraform.tfvars`** (ignored by git): copy `terraform.tfvars.example`, and put your admin public key
   (`Get-Content ~\.ssh\tectonic_box.pub`) in `admin_public_keys`.

Then, in PowerShell from the repository root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass   # Windows blocks scripts by default; this window only
. .\infra\env.ps1                     # asks for the six secrets above, hidden; this window only
cd infra
tofu init -backend-config=backend.hcl # connects to the encrypted state
tofu plan                             # what would change: read it
```

## Everyday commands

```powershell
tofu plan                      # always first
tofu apply                     # after reading the plan
tofu output known_hosts_line   # non-secret outputs; `tofu output -json backup_env` shows the secret one
```

`tofu fmt -recursive` before committing. CI runs `tofu fmt -check` and `tofu validate` (no credentials needed).

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
4. Wait for first boot: as root with your admin key, `tail -f /var/log/cloud-init-output.log` until "bootstrapped". **The staging
   password is printed there once**: copy it to the password manager, then clear that line (`sudo truncate -s 0
   /var/log/cloud-init-output.log`). If a step failed, the log says which; fix it and re-run that command (all are idempotent).
5. On your PC: `ssh-keygen -R 5.161.101.213` (the machine is new, but tofu gave it the same host key as before, so this
   normally prints nothing; run it anyway if ssh complains).
6. `bash infra/push-backup-env.sh` (needs `jq`), then `ssh deploy@5.161.101.213` and `deploy/fill-secrets.sh` (staging needs only
   the Discord values; production everything).
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
