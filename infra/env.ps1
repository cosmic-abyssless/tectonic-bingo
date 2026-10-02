# Sets the credentials and app secrets a `tofu` run needs, for THIS PowerShell window only. Dot-source it (note the leading dot):
#
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass     # once per window: Windows blocks scripts by default
#     . .\infra\env.ps1                                              # from Bitwarden (one unlock)
#     . .\infra\env.ps1 -Prompt                                      # or type each value in
#
# (`-Scope Process` lasts only until the window is closed; nothing about the machine's settings changes.)
#
# Every value comes from Bitwarden, through its CLI (`bw`, https://bitwarden.com/help/cli/): one item per value, named
# "tectonic-bingo/<NAME>" with the value as the item's password (the list is below). The first time on a machine, `bw login`;
# after that this script asks for the master password once (bw unlock) and reads them all. An item it cannot find, or every
# value with -Prompt (or without bw), it asks for with hidden input instead. Nothing is echoed, saved in history, or written to
# a file. infra/README.md says where each value is created. Run `bw lock` and close the window afterwards.
param([switch]$Prompt)

$values = @(
    # What tofu logs in with.
    @{ Name = "HCLOUD_TOKEN"; Hint = "Hetzner Cloud API token, read & write" },
    @{ Name = "CLOUDFLARE_API_TOKEN"; Hint = "Cloudflare user token: R2 edit + API tokens edit" },
    @{ Name = "GITHUB_TOKEN"; Hint = "GitHub fine-grained token for this repository: administration + secrets" },
    @{ Name = "AWS_ACCESS_KEY_ID"; Hint = "R2 access key id for the tofu STATE bucket" },
    @{ Name = "AWS_SECRET_ACCESS_KEY"; Hint = "R2 secret access key for the tofu STATE bucket" },
    @{ Name = "TF_VAR_state_passphrase"; Hint = "the state encryption passphrase (16+ characters)" },
    # The app's secrets (app-env.tf).
    @{ Name = "TF_VAR_discord_client_secret"; Hint = "Discord application > OAuth2 > client secret" },
    @{ Name = "TF_VAR_staging_session_secret"; Hint = "staging's SESSION_SECRET" },
    @{ Name = "TF_VAR_production_session_secret"; Hint = "production's SESSION_SECRET" },
    @{ Name = "TF_VAR_staging_password"; Hint = "the staging site's password (username: team)" },
    @{ Name = "TF_VAR_tectonic_api_key"; Hint = "the clan API key" },
    @{ Name = "TF_VAR_wom_api_key"; Hint = "the Wise Old Man API key" },
    @{ Name = "TF_VAR_runeprofile_api_key"; Hint = "the RuneProfile API key" }
)

function Read-Secret([string]$name, [string]$hint) {
    $secure = Read-Host -AsSecureString "$name  ($hint)"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ([string]::IsNullOrWhiteSpace($plain)) { throw "$name was empty" }
    return $plain.Trim()
}

$useBitwarden = -not $Prompt -and (Get-Command bw -ErrorAction SilentlyContinue)
if ($useBitwarden) {
    $status = (bw status | ConvertFrom-Json).status
    if ($status -eq "unauthenticated") { throw "Bitwarden: run 'bw login' once on this machine first (or use -Prompt)" }
    if ($status -ne "unlocked") {
        # bw asks for the master password itself; --raw prints only the session key, kept for this window.
        $env:BW_SESSION = bw unlock --raw
        if (-not $env:BW_SESSION) { throw "Bitwarden: could not unlock" }
    }
    $null = bw sync
} elseif (-not $Prompt) {
    Write-Host "bw (the Bitwarden CLI) is not installed, so each value is asked for. https://bitwarden.com/help/cli/"
}

$missing = @()
foreach ($v in $values) {
    $value = $null
    if ($useBitwarden) {
        $value = bw get password "tectonic-bingo/$($v.Name)" 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) { $value = $null; $missing += $v.Name }
    }
    if (-not $value) { $value = Read-Secret $v.Name $v.Hint }
    Set-Item -Path "env:$($v.Name)" -Value ($value.Trim())
}
if ($missing.Count -gt 0) {
    Write-Host "Not in Bitwarden (asked for instead): $($missing -join ', '). Add them as items named tectonic-bingo/<NAME>."
}

# OpenTofu, if this window predates its installation.
if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
Write-Host 'Credentials are set for this window only. Next: cd infra; tofu init "-backend-config=backend.hcl"'
