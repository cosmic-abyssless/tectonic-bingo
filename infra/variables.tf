# Everything that varies. Values come from terraform.tfvars (copy terraform.tfvars.example; it is ignored by git) or
# TF_VAR_* environment variables. Nothing here is a secret except state_passphrase, which is why it is the one with no
# place in a file.

variable "state_passphrase" {
  description = "Encrypts the state (see backend.tf). From the password manager, as TF_VAR_state_passphrase."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "Use at least 16 characters."
  }
}

variable "cloudflare_account_id" {
  description = "The Cloudflare account that holds the R2 buckets (it is in every R2 URL)."
  type        = string
}

variable "github_owner" {
  description = "The GitHub user or organisation that owns the repository."
  type        = string
  default     = "cosmic-abyssless"
}

variable "github_repository" {
  description = "The repository name (without the owner)."
  type        = string
  default     = "tectonic-bingo"
}

variable "server_name" {
  description = "The server's name in Hetzner and its hostname."
  type        = string
  default     = "tectonic-box"
}

variable "server_type" {
  description = "Hetzner server type. cpx31 is 4 vCPU / 8 GB, the size the deploy plan assumes (docs/zero-downtime-deploy-plan.md)."
  type        = string
  default     = "cpx31"
}

variable "location" {
  description = "Hetzner location: ash (Ashburn, US East) for the players' latency."
  type        = string
  default     = "ash"
}

variable "image" {
  description = "The operating system image. deploy/bootstrap-box.sh is written for Ubuntu 24.04."
  type        = string
  default     = "ubuntu-24.04"
}

variable "admin_public_keys" {
  description = "The public SSH keys of the people who administer the box, one per entry (the contents of a .pub file). They get an ordinary shell as the deploy user; the first one is also registered with Hetzner for root."
  type        = list(string)

  validation {
    condition     = length(var.admin_public_keys) >= 1 && alltrue([for k in var.admin_public_keys : can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+) ", k))])
    error_message = "Give at least one public key, each starting with its type (ssh-ed25519 ...). Public keys only: never the private half."
  }
}

variable "backup_bucket_name" {
  description = "The R2 bucket the database replica and the uploads are backed up to (deploy/README.md, Backups)."
  type        = string
  default     = "tectonic-backups"
}

variable "backup_bucket_location" {
  description = "R2 location hint for the backup bucket: ENAM (Eastern North America) keeps it near the server."
  type        = string
  default     = "ENAM"
}

variable "ssh_port" {
  description = "The SSH port the firewall keeps open."
  type        = number
  default     = 22
}
