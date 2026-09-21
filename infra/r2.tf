# The backup bucket and a token that can reach only that bucket. deploy/README.md ("Backups and restoring") explains what
# goes in it; this makes it exist.

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.cloudflare_account_id
  name       = var.backup_bucket_name
  location   = var.backup_bucket_location
}

# Cloudflare names its permissions; look the two R2 object permissions up by name rather than hard-coding their ids.
data "cloudflare_api_token_permission_groups_list" "all" {}

locals {
  r2_permission_ids = {
    for group in data.cloudflare_api_token_permission_groups_list.all.result :
    group.name => group.id
    if contains(["Workers R2 Storage Bucket Item Read", "Workers R2 Storage Bucket Item Write"], group.name)
  }
}

# Read & write on this one bucket, nothing else in the account. Litestream and rclone use it as S3 credentials: the access
# key id is the token's id and the secret is the SHA-256 of the token value (Cloudflare documents this derivation), so
# nothing has to be copied out of a dashboard.
resource "cloudflare_api_token" "backups" {
  name = "${var.server_name}-backups (managed by infra/)"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = local.r2_permission_ids["Workers R2 Storage Bucket Item Read"] },
      { id = local.r2_permission_ids["Workers R2 Storage Bucket Item Write"] },
    ]
    # A JSON string in this provider version, not an object.
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${cloudflare_r2_bucket.backups.name}" = "*"
    })
  }]

  lifecycle {
    precondition {
      condition     = length(local.r2_permission_ids) == 2
      error_message = "Could not find both R2 object permission groups by name; Cloudflare may have renamed them. See infra/r2.tf."
    }
  }
}

locals {
  backup_endpoint   = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  backup_access_key = cloudflare_api_token.backups.id
  backup_secret_key = sha256(cloudflare_api_token.backups.value)

  # The two files the box needs (deploy/backup.env.example documents every line). Only the prefix differs: each
  # environment has its own history in the bucket and they must never share one.
  backup_env = {
    for env in ["staging", "production"] :
    env => join("\n", [
      "# Written by infra/push-backup-env.sh from tofu's outputs; edit BACKUP_PING_URL and the optional settings, nothing else.",
      "BACKUP_ENDPOINT=${local.backup_endpoint}",
      "BACKUP_BUCKET=${cloudflare_r2_bucket.backups.name}",
      "BACKUP_PREFIX=${env}",
      "BACKUP_ACCESS_KEY_ID=${local.backup_access_key}",
      "BACKUP_SECRET_ACCESS_KEY=${local.backup_secret_key}",
      "BACKUP_PING_URL=",
      "BACKUP_S3_PROVIDER=Cloudflare",
      "",
    ])
  }
}
