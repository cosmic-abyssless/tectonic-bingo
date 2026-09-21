# What the repository needs to know about the box: how the box reads the repository, and how the Deploy workflow reaches
# the box (.github/workflows/deploy.yml lists these secrets).

resource "github_repository_deploy_key" "box" {
  repository = var.github_repository
  title      = "${var.server_name} (read-only, managed by infra/)"
  key        = local.repo_public_key
  read_only  = true
}

resource "github_actions_secret" "deploy_host" {
  repository  = var.github_repository
  secret_name = "DEPLOY_HOST"
  value       = hcloud_primary_ip.box.ip_address
}

resource "github_actions_secret" "deploy_user" {
  repository  = var.github_repository
  secret_name = "DEPLOY_USER"
  value       = "deploy"
}

resource "github_actions_secret" "deploy_ssh_key" {
  repository  = var.github_repository
  secret_name = "DEPLOY_SSH_KEY"
  value       = tls_private_key.ci.private_key_openssh
}

# The server's host key, known before the server exists (keys.tf), so the workflow refuses any machine that isn't this one.
resource "github_actions_secret" "deploy_known_hosts" {
  repository  = var.github_repository
  secret_name = "DEPLOY_KNOWN_HOSTS"
  value       = local.known_hosts_line
}
