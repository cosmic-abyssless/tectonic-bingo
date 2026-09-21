# The three key pairs the setup needs, generated here so no human ever handles a private key by hand and a rebuild gets
# the same ones. All three private halves live in the (encrypted) state.

# What GitHub Actions deploys with. Pinned on the box to deploy/ssh-entry.sh, so it can deploy and nothing else.
resource "tls_private_key" "ci" {
  algorithm = "ED25519"
}

# The box's own read-only access to the repository, so the deploy scripts come from git (only commits on main), never from
# whoever holds the CI key.
resource "tls_private_key" "repo" {
  algorithm = "ED25519"
}

# The server's SSH host key, installed at first boot. Because it is decided here, `DEPLOY_KNOWN_HOSTS` can be written
# before the machine exists, and a rebuilt server has the same identity, so nothing that trusts it needs updating.
resource "tls_private_key" "host" {
  algorithm = "ED25519"
}

locals {
  repo_ssh_url     = "git@github.com:${var.github_owner}/${var.github_repository}.git"
  ci_public_key    = "${trimspace(tls_private_key.ci.public_key_openssh)} github-actions"
  repo_public_key  = "${trimspace(tls_private_key.repo.public_key_openssh)} tectonic-box-read-only"
  host_public_key  = trimspace(tls_private_key.host.public_key_openssh)
  known_hosts_line = "${hcloud_primary_ip.box.ip_address} ${local.host_public_key}"
}
