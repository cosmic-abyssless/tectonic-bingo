# Pinned on purpose: the Cloudflare provider's v5 rewrite renamed resources and changed schemas, and hcloud's server
# schema has moved before. Bump one at a time, with `tofu plan` showing no changes afterwards.
terraform {
  required_version = ">= 1.8.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

# Credentials come from the environment for the duration of a run, never from a file:
#   HCLOUD_TOKEN           Hetzner Cloud API token (read & write) for the project
#   CLOUDFLARE_API_TOKEN   a user API token with "Workers R2 Storage: Edit" and "API Tokens: Edit"
#   GITHUB_TOKEN           a fine-grained token for this repository: Administration (read & write) and Secrets (read & write)
provider "hcloud" {}

provider "cloudflare" {}

provider "github" {
  owner = var.github_owner
}
