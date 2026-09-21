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
