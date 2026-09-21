# Sets the credentials a `tofu` run needs, for THIS PowerShell window only. Dot-source it (note the leading dot):
#
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass     # once per window: Windows blocks scripts by default
#     . .\infra\env.ps1
#
# (`-Scope Process` lasts only until the window is closed; nothing about the machine's settings changes.)
#
# It asks for each value with hidden input, so nothing is echoed, saved in history, or written to a file. Get the values from
# the team's password manager; infra/README.md says where each one is created. Close the window afterwards.
function Read-Secret([string]$name, [string]$hint) {
    $secure = Read-Host -AsSecureString "$name  ($hint)"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ([string]::IsNullOrWhiteSpace($plain)) { throw "$name was empty" }
    return $plain.Trim()
}

$env:HCLOUD_TOKEN = Read-Secret "HCLOUD_TOKEN" "Hetzner Cloud API token, read & write"
$env:CLOUDFLARE_API_TOKEN = Read-Secret "CLOUDFLARE_API_TOKEN" "Cloudflare user token: R2 edit + API tokens edit"
$env:GITHUB_TOKEN = Read-Secret "GITHUB_TOKEN" "GitHub fine-grained token for this repository: administration + secrets"
$env:AWS_ACCESS_KEY_ID = Read-Secret "AWS_ACCESS_KEY_ID" "R2 access key id for the tofu STATE bucket"
$env:AWS_SECRET_ACCESS_KEY = Read-Secret "AWS_SECRET_ACCESS_KEY" "R2 secret access key for the tofu STATE bucket"
$env:TF_VAR_state_passphrase = Read-Secret "TF_VAR_state_passphrase" "the state encryption passphrase (16+ characters)"

# OpenTofu, if this window predates its installation.
if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
Write-Host "Credentials are set for this window only. Next: cd infra; tofu init -backend-config=backend.hcl"
