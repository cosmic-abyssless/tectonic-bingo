#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 LTS server so it can host the site. Run as root, from a checkout of this
# repository's deploy/ directory, on the new machine. Safe to run again: every step checks before it changes anything.
#
#   sudo ./bootstrap-box.sh --ci-public-key FILE [--admin-key-file FILE] [--ssh-port N] [--skip STEPS]
#
#   --ci-public-key FILE   the PUBLIC half of the key GitHub Actions deploys with. It is pinned to deploy/ssh-entry.sh, so it
#                          can load an image and run a deploy and nothing else. Generate it with
#                          `ssh-keygen -t ed25519 -f deploy_key -C github-actions -N ''`; the private half becomes the
#                          DEPLOY_SSH_KEY secret.
#   --admin-key-file FILE  public key(s) of the people who administer the box. They get an ordinary shell as the deploy user.
#   --ssh-port N           the SSH port to keep open in the firewall (default 22)
#   --skip STEPS           comma-separated steps to leave out: packages, docker, docker-logs, user, dirs, keys, ssh, firewall,
#                          upgrades (mainly so the script can be tested in a container)
#
# What it sets up (docs/zero-downtime-deploy-plan.md, "Ops on the box"):
#   - Docker Engine and the Compose plugin from Docker's own apt repository, with log rotation so container logs can never
#     fill the disk
#   - a `deploy` user in the docker group; the layout under /srv/tectonic (deploy/, env/, data/, caddy/, state/)
#   - the CI key restricted to ssh-entry.sh, and the admins' keys
#   - SSH keys only (no passwords), a firewall that allows only SSH, HTTP and HTTPS, and automatic security updates
#     that never reboot on their own (a reboot is scheduled by a person: blue/green does not cover one)
#
# It does NOT create the secrets. See "Setting up the server" in deploy/README.md for what to do next.
set -euo pipefail

root="/srv/tectonic"
ci_key_file=""; admin_key_file=""; ssh_port=22; skip=","
here="$(cd "$(dirname "$0")" && pwd)"

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'BOOTSTRAP FAILED: %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }
skipped() { case "$skip" in *",$1,"*) echo "(skipping $1)"; return 0 ;; esac; return 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --ci-public-key) ci_key_file="${2:?--ci-public-key needs a file}"; shift 2 ;;
    --admin-key-file) admin_key_file="${2:?--admin-key-file needs a file}"; shift 2 ;;
    --ssh-port) ssh_port="${2:?--ssh-port needs a number}"; shift 2 ;;
    --skip) skip=",${2:?--skip needs a list},"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run this as root (sudo)"
[ -f "$here/ssh-entry.sh" ] && [ -f "$here/deploy.sh" ] || die "run it from a checkout of the repository's deploy/ directory"
[[ "$ssh_port" =~ ^[0-9]{1,5}$ ]] || die "--ssh-port must be a number"
if ! skipped keys >/dev/null; then
  [ -n "$ci_key_file" ] && [ -f "$ci_key_file" ] || die "--ci-public-key FILE is required (the public half of the CI deploy key)"
  grep -q -E '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+) ' "$ci_key_file" || die "$ci_key_file does not look like a public key"
  ! grep -q "PRIVATE KEY" "$ci_key_file" || die "$ci_key_file contains a PRIVATE key. Give this script only the public half."
  [ -z "$admin_key_file" ] || [ -f "$admin_key_file" ] || die "no such file: $admin_key_file"
fi

# ---- packages ----------------------------------------------------------------------------------------------------
if ! skipped packages; then
  say "Installing base packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg ufw unattended-upgrades >/dev/null
fi

# ---- docker ------------------------------------------------------------------------------------------------------
if ! skipped docker; then
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    say "Docker and the Compose plugin are already installed"
  else
    say "Installing Docker Engine and the Compose plugin from Docker's apt repository"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck source=/dev/null
    codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" >/etc/apt/sources.list.d/docker.list
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  fi
fi

if ! skipped docker-logs; then
  say "Rotating container logs (20 MB x 5 per container), so they can't fill the disk"
  install -d /etc/docker
  if [ -f /etc/docker/daemon.json ]; then
    echo "/etc/docker/daemon.json already exists: leaving it alone. Check it sets log-opts max-size and max-file."
  else
    cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
EOF
    if command -v systemctl >/dev/null && systemctl is-active --quiet docker; then systemctl restart docker; fi
  fi
fi

# ---- user and directories ----------------------------------------------------------------------------------------
if ! skipped user; then
  say "Creating the deploy user"
  id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
  if getent group docker >/dev/null; then usermod -aG docker deploy; else echo "(no docker group yet: add deploy to it once Docker is installed)"; fi
fi

if ! skipped dirs; then
  say "Creating $root"
  install -d -o deploy -g deploy -m 755 "$root" "$root/deploy" "$root/caddy" "$root/caddy/sites" "$root/state"
  # Secrets: readable by the deploy user only.
  install -d -o deploy -g deploy -m 750 "$root/env"
  # The app runs as uid 1000 inside its containers, so its data directories are owned by that number whatever the
  # host calls it. (Litestream runs as 1000 too.)
  for environment in production staging; do
    install -d -o 1000 -g 1000 -m 755 "$root/data/$environment" "$root/data/$environment/sqlite" "$root/data/$environment/uploads"
  done
  # The deploy scripts of this checkout, so the CI key's very first `sync-deploy` has a wrapper to run under.
  cp -a "$here/." "$root/deploy/"
  chown -R deploy:deploy "$root/deploy"
  chmod +x "$root/deploy/"*.sh
fi

# ---- ssh keys ----------------------------------------------------------------------------------------------------
if ! skipped keys; then
  say "Installing the SSH keys"
  install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
  authorized=/home/deploy/.ssh/authorized_keys
  touch "$authorized"
  add_key() { # line
    grep -qxF "$1" "$authorized" || printf '%s\n' "$1" >>"$authorized"
  }
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # `restrict` turns off port and agent forwarding, X11 and a terminal; `command` pins the key to the wrapper.
    add_key "restrict,command=\"$root/deploy/ssh-entry.sh\" $line"
  done <"$ci_key_file"
  if [ -n "$admin_key_file" ]; then
    while IFS= read -r line; do [ -n "$line" ] && add_key "$line"; done <"$admin_key_file"
  fi
  chown deploy:deploy "$authorized"; chmod 600 "$authorized"
fi

# ---- ssh hardening -----------------------------------------------------------------------------------------------
if ! skipped ssh; then
  say "Turning off password logins over SSH"
  if command -v sshd >/dev/null && [ -d /etc/ssh/sshd_config.d ]; then
    cat >/etc/ssh/sshd_config.d/10-tectonic.conf <<'EOF'
# Keys only. (Root may still log in with a key, but there is no password to guess.)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
    sshd -t || { rm -f /etc/ssh/sshd_config.d/10-tectonic.conf; die "sshd rejected the hardening file; it was removed and nothing changed"; }
    if command -v systemctl >/dev/null; then systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true; fi
    echo "Make sure you can log in with your key in a SECOND terminal before closing this one."
  else
    echo "(sshd is not installed here; nothing to harden)"
  fi
fi

# ---- firewall ----------------------------------------------------------------------------------------------------
if ! skipped firewall; then
  say "Enabling the firewall: SSH ($ssh_port), HTTP and HTTPS only"
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  # SSH first, so enabling the firewall can never lock you out.
  ufw allow "$ssh_port/tcp" >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
  # Docker publishes ports by editing iptables directly, bypassing ufw. The stacks here publish only 80 and 443, and
  # nothing else is published; keep it that way (never add a `ports:` entry for a database or an admin tool).
fi

# ---- automatic updates -------------------------------------------------------------------------------------------
if ! skipped upgrades; then
  say "Enabling automatic security updates (without automatic reboots)"
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  cat >/etc/apt/apt.conf.d/52tectonic-unattended-upgrades <<'EOF'
// A kernel update needs a reboot to take effect. Reboot on purpose, in a quiet window, not whenever apt decides to.
Unattended-Upgrade::Automatic-Reboot "false";
EOF
  if command -v timedatectl >/dev/null; then timedatectl set-timezone UTC 2>/dev/null || true; fi
fi

say "Done"
cat <<EOF

Next (see "Setting up the server" in deploy/README.md):
  1. As the deploy user, put the secrets in $root/env/:
       production.env, staging.env             the app's settings (deploy/env/*.env.example)
       production.backup.env, staging.backup.env   where backups go (deploy/backup.env.example; a different BACKUP_PREFIX each)
       staging.basic-auth                       one line: a username, a space, and a hash from 'caddy hash-password'
  2. Start the shared front door:    $root/deploy/deploy.sh edge
  3. Add the GitHub secrets (DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS), then merge to main: staging deploys itself.
  4. Point DNS at this machine, check staging, then run the Deploy workflow for production.
EOF
