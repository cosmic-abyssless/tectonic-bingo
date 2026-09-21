# The machine: one address that outlives any server, a firewall, and the server itself, set up on first boot by cloud-init.

# The public address. Its own resource so that deleting and rebuilding the server keeps the same IP: DNS never changes,
# and neither does DEPLOY_HOST. `auto_delete = false` is what makes it survive the server.
resource "hcloud_primary_ip" "box" {
  name        = "${var.server_name}-ipv4"
  type        = "ipv4"
  location    = var.location
  auto_delete = false

  lifecycle {
    # Losing the address means changing DNS and every secret that names it. Replace it only on purpose.
    prevent_destroy = true
  }
}

# The first admin key, registered with Hetzner so root can log in before the bootstrap has run. The others are installed by
# the bootstrap (for the deploy user) from the file cloud-init writes.
resource "hcloud_ssh_key" "admin" {
  name = "${var.server_name}-admin"
  # Hetzner stores the key without its trailing comment, so pass only "type key": otherwise the comment makes every plan think
  # the key changed and want to replace it.
  public_key = join(" ", slice(split(" ", trimspace(var.admin_public_keys[0])), 0, 2))
}

# Outside the machine, in addition to ufw inside it (deploy/bootstrap-box.sh): Docker bypasses the machine's own firewall
# for published ports, so this is the layer that holds if a `ports:` entry ever appears by mistake.
resource "hcloud_firewall" "box" {
  name = var.server_name

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # SSH from anywhere: deploys come from GitHub's runners, whose addresses change. Keys only; no passwords.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = tostring(var.ssh_port)
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTP/3.
  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "box" {
  name        = var.server_name
  server_type = var.server_type
  location    = var.location
  image       = var.image
  ssh_keys    = [hcloud_ssh_key.admin.id]

  # Hetzner's own snapshot backups are off (a decision, not an oversight): R2 holds the data, and this file rebuilds the machine.
  backups = false

  public_net {
    ipv4_enabled = true
    ipv4         = hcloud_primary_ip.box.id
    ipv6_enabled = true
  }

  firewall_ids = [hcloud_firewall.box.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    host_private_key = tls_private_key.host.private_key_openssh
    host_public_key  = local.host_public_key
    repo_private_key = tls_private_key.repo.private_key_openssh
    ci_public_key    = local.ci_public_key
    admin_keys       = join("\n", var.admin_public_keys)
    repo_ssh_url     = local.repo_ssh_url
    ssh_port         = var.ssh_port
    hostname         = var.server_name
  })

  lifecycle {
    # cloud-init runs once, at creation. Editing the template (or Hetzner refreshing the image) must not quietly destroy
    # and recreate the server, which is what a changed user_data would do. To rebuild on purpose:
    #   tofu apply -replace=hcloud_server.box
    ignore_changes = [user_data, image, ssh_keys]
  }

  # The firewall must exist before the server is reachable, and GitHub must know the repo key before first boot clones.
  depends_on = [github_repository_deploy_key.box]
}
