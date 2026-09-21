# Where the state lives, and how it is protected.
#
# State holds every secret tofu creates (the CI key, the box's repository key, the server's host key, the R2 backup token),
# so it is kept in a private R2 bucket that nothing else uses, and encrypted by OpenTofu itself before it is written: the
# bucket alone is not enough to read it. The passphrase lives in the team's password manager, with the tokens.
#
# The bucket and its credentials are the one piece of infrastructure made by hand (state cannot store itself):
#   bucket  tectonic-tofu-state   in the same Cloudflare account
#   token   Object Read & Write, scoped to that bucket only  -> AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for tofu runs
# The endpoint (which carries the account id, not a secret) is in backend.hcl: `tofu init "-backend-config=backend.hcl"`.

terraform {
  backend "s3" {
    bucket = "tectonic-tofu-state"
    key    = "tectonic.tfstate"
    region = "auto"

    # R2 is S3-compatible but not S3: skip the checks that assume AWS.
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }

  encryption {
    key_provider "pbkdf2" "passphrase" {
      passphrase = var.state_passphrase
    }

    method "aes_gcm" "default" {
      keys = key_provider.pbkdf2.passphrase
    }

    state {
      method   = method.aes_gcm.default
      enforced = true
    }

    plan {
      method   = method.aes_gcm.default
      enforced = true
    }
  }
}
