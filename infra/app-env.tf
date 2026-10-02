# The app's own settings and secrets: /srv/tectonic/env/staging.env and production.env, and staging's password
# (staging.basic-auth). Rendered here from the values below and written onto the box by infra/push-env.sh (or .ps1); the
# containers read them when they start, so a change reaches the app with the next deploy. See "App settings and secrets" in
# README.md.
#
# Where each value comes from:
#   - secrets: TF_VAR_* from Bitwarden, set by env.ps1 for the length of a run. Sensitive, so plans never print them; they
#     do sit in state, which is encrypted (backend.tf).
#   - settings that are not secret but not for a public repository (Discord ids, the clan API): terraform.tfvars.
#   - everything else: the locals below, reviewed like code.

# ---- secrets (TF_VAR_*, from Bitwarden) -----------------------------------------------------------------------------

variable "discord_client_secret" {
  description = "The Discord application's client secret. One application serves both environments."
  type        = string
  sensitive   = true
}

variable "staging_session_secret" {
  description = "Signs staging's session cookies. Different from production's; changing it signs everyone out."
  type        = string
  sensitive   = true
}

variable "production_session_secret" {
  description = "Signs production's session cookies. Different from staging's; changing it signs everyone out."
  type        = string
  sensitive   = true
}

variable "staging_password" {
  description = "The shared password Caddy asks for on all of staging except /health (username: team)."
  type        = string
  sensitive   = true
}

variable "tectonic_api_key" {
  description = "The clan API's key. Production only: staging never calls the live clan APIs."
  type        = string
  sensitive   = true
}

variable "wom_api_key" {
  description = "Wise Old Man's API key. Production only."
  type        = string
  sensitive   = true
}

variable "runeprofile_api_key" {
  description = "RuneProfile's API key. Production only."
  type        = string
  sensitive   = true
}

# ---- settings that stay out of the repository (terraform.tfvars) --------------------------------------------------

variable "discord_client_id" {
  description = "The Discord application's client id."
  type        = string
}

variable "discord_guild_id" {
  description = "The clan's Discord server id."
  type        = string
}

variable "admin_discord_ids" {
  description = "Comma-separated Discord user ids: the Owners (CONTEXT.md), site admins on first login who alone can grant and revoke it."
  type        = string
}

variable "tectonic_api_url" {
  description = "The clan API's address. Production only."
  type        = string
}

variable "tectonic_guild_id" {
  description = "The clan's id in the clan API. Production only."
  type        = string
}

variable "user_agent_contact" {
  description = "Contact details sent in the User-Agent to the clan APIs. Production only."
  type        = string
}

# ---- the files -------------------------------------------------------------------------------------------------------

locals {
  sentry_dsn        = "https://3b7db6f6e1855ee5751af4ef3b5bf8f1@o4512121532973056.ingest.us.sentry.io/4512121567379456"
  client_sentry_dsn = "https://f6af116b972e4041efc5e85e720306e6@o4512121532973056.ingest.us.sentry.io/4512121567510528"

  # The same in both environments.
  app_common = {
    DISCORD_CLIENT_ID     = var.discord_client_id
    DISCORD_CLIENT_SECRET = var.discord_client_secret
    DISCORD_GUILD_ID      = var.discord_guild_id
    ADMIN_DISCORD_IDS     = var.admin_discord_ids
    # The Sentry addresses identify the projects events go to; they are not secrets (the browser one is in every page).
    SENTRY_DSN        = local.sentry_dsn
    CLIENT_SENTRY_DSN = local.client_sentry_dsn
    # How long to wait for the OCR service before giving up on a screenshot (ms).
    OCR_TIMEOUT_MS = "20000"
  }

  app_settings = {
    # The same image as production with its own data. Dev-login is on (the test-data generator and "log in as" need it),
    # which needs NODE_ENV to be something other than production, so the Secure cookie flag is put back by hand. The clan
    # integrations are blank and switched off so test data never calls the live APIs.
    staging = merge(local.app_common, {
      NODE_ENV                      = "staging"
      DEV_LOGIN_ENABLED             = "true"
      COOKIE_SECURE                 = "true"
      CLIENT_URL                    = "https://staging.tectonic.bingo"
      DISCORD_CALLBACK_URL          = "https://staging.tectonic.bingo/auth/discord/callback"
      SESSION_SECRET                = var.staging_session_secret
      TECTONIC_API_URL              = ""
      TECTONIC_API_KEY              = ""
      TECTONIC_GUILD_ID             = ""
      WOM_API_KEY                   = ""
      RUNEPROFILE_API_KEY           = ""
      USER_AGENT_CONTACT            = ""
      PLAYER_STATS_FETCH_DISABLED   = "true"
      WOM_COMPETITION_SYNC_DISABLED = "true"
      WOM_SNAPSHOT_READS_DISABLED   = "true"
      SENTRY_ENVIRONMENT            = "staging"
    })
    # The image sets NODE_ENV=production itself, which turns dev-login off and marks the session cookie Secure.
    production = merge(local.app_common, {
      CLIENT_URL           = "https://tectonic.bingo"
      DISCORD_CALLBACK_URL = "https://tectonic.bingo/auth/discord/callback"
      SESSION_SECRET       = var.production_session_secret
      TECTONIC_API_URL     = var.tectonic_api_url
      TECTONIC_API_KEY     = var.tectonic_api_key
      TECTONIC_GUILD_ID    = var.tectonic_guild_id
      WOM_API_KEY          = var.wom_api_key
      RUNEPROFILE_API_KEY  = var.runeprofile_api_key
      USER_AGENT_CONTACT   = var.user_agent_contact
      SENTRY_ENVIRONMENT   = "production"
    })
  }

  # One KEY=value per line, sorted. Nothing is quoted: Compose reads the line after the first "=" as the value.
  app_env = {
    for environment, settings in local.app_settings : environment => join("\n", concat(
      [
        "# ${environment}'s settings and secrets. Written by infra/push-env from OpenTofu: change infra/app-env.tf (or the",
        "# value in Bitwarden) and push again, rather than editing this file.",
      ],
      [for key in sort(keys(settings)) : "${key}=${settings[key]}"],
    ))
  }
}

# Staging's password as Caddy wants it: "team <bcrypt hash>". bcrypt salts every hash differently, so the hash is made once
# and kept (ignore_changes), and made again only when the password itself changes (the digest below is replaced).
resource "terraform_data" "staging_password_digest" {
  input = sha256(var.staging_password)
}

resource "terraform_data" "staging_basic_auth" {
  input = "team ${bcrypt(var.staging_password)}"

  lifecycle {
    ignore_changes       = [input]
    replace_triggered_by = [terraform_data.staging_password_digest]
  }
}
