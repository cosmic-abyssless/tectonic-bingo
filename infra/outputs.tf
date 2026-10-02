output "server_ipv4" {
  description = "The box's address: what DNS points at and what DEPLOY_HOST holds."
  value       = hcloud_primary_ip.box.ip_address
}

output "known_hosts_line" {
  description = "The server's SSH host key, as a known_hosts line. Also what DEPLOY_KNOWN_HOSTS holds."
  value       = local.known_hosts_line
}

output "host_key_fingerprint" {
  description = "For comparing with what ssh shows on first connection."
  value       = tls_private_key.host.public_key_fingerprint_sha256
}

output "ci_public_key" {
  description = "The public half of the key GitHub Actions deploys with (pinned to deploy/ssh-entry.sh on the box)."
  value       = local.ci_public_key
}

output "repo_public_key" {
  description = "The public half of the box's read-only repository key (registered as a deploy key)."
  value       = local.repo_public_key
}

output "backup_env" {
  description = "The contents of staging.backup.env and production.backup.env. Sensitive: read with `tofu output -json backup_env`, or let infra/push-backup-env.sh put them on the box."
  value       = local.backup_env
  sensitive   = true
}

output "dns_records_to_ask_for" {
  description = "DNS stays with Mico, by hand: these are the records, all DNS-only (grey cloud), never proxied, or Caddy cannot get a certificate."
  value = {
    "staging.tectonic.bingo" = "A ${hcloud_primary_ip.box.ip_address} (now)"
    "tectonic.bingo"         = "A ${hcloud_primary_ip.box.ip_address} (at cutover, phase 6)"
    "www.tectonic.bingo"     = "A ${hcloud_primary_ip.box.ip_address} (at cutover, phase 6)"
    "tectonic.cc"            = "A ${hcloud_primary_ip.box.ip_address} (at decommission, phase 7: Caddy redirects it)"
  }
}

output "app_env" {
  description = "The contents of staging.env and production.env (app-env.tf). Sensitive: infra/push-env.sh (or .ps1) puts them on the box."
  value       = local.app_env
  sensitive   = true

  # The mistakes a typo in Bitwarden would make, caught before anything reaches the box.
  precondition {
    condition     = var.staging_session_secret != var.production_session_secret
    error_message = "Staging and production must not share a SESSION_SECRET."
  }
  precondition {
    condition     = length(var.staging_session_secret) >= 32 && length(var.production_session_secret) >= 32
    error_message = "A SESSION_SECRET should be at least 32 characters (openssl rand -hex 32)."
  }
  precondition {
    condition     = alltrue([for settings in values(local.app_settings) : alltrue([for value in values(settings) : !can(regex("[\r\n]", value))])])
    error_message = "A value contains a line break, which would split it across lines of the env file."
  }
  # Compose's dotenv parser substitutes $VARIABLES and starts a comment at " #" in an unquoted value, and reads a value that
  # starts with a quote as quoted: a secret holding any of them would reach the app changed (app-env.tf).
  precondition {
    condition     = alltrue([for settings in values(local.app_settings) : alltrue([for value in values(settings) : !can(regex("[$#]|^[\"']", value))])])
    error_message = "A value contains $ or #, or starts with a quote, which Compose would change on the way to the app. Choose another (for a secret: openssl rand -hex 32)."
  }
}

output "staging_basic_auth" {
  description = "staging.basic-auth: the username and the bcrypt hash of staging's password, as Caddy wants them. Sensitive."
  value       = terraform_data.staging_basic_auth.output
  sensitive   = true
}

output "staging_login" {
  description = "Staging's address and password, for infra/push-env to check the password logs in to the live site. Sensitive."
  value       = { url = local.app_settings.staging.CLIENT_URL, user = "team", password = var.staging_password }
  sensitive   = true
}
