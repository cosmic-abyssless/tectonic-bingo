<#
.SYNOPSIS
  Puts the app's settings and secrets OpenTofu renders (app-env.tf) onto the box: staging.env, production.env and
  staging.basic-auth. Checks only, unless -Write.

.DESCRIPTION
  The PowerShell twin of push-env.sh (which needs bash, jq and curl). Run it from a window where `. .\infra\env.ps1` has been run,
  because it reads `tofu output`.

  By default it only CHECKS: for each file it lists, by name and never by value, which settings are the same as the box's,
  different, new or only on the box (those are kept), and it checks the staging password in OpenTofu logs in to the live staging
  site. -Write then replaces the files, keeping each previous one as FILE.bak. The containers read these files when they start, so
  a written change reaches the app with each environment's next deploy; nothing running is touched.

  The comparing and writing happen on the box, in env-sync.sh, which is sent over ssh's standard input with the new contents
  base64-encoded: no secret is ever on a command line. It trusts the server by the SSH host key tofu generated.

.PARAMETER Write
  Replace the files. Without it, nothing on the box changes.

.PARAMETER Only
  Just one environment: staging or production.

.PARAMETER NewStagingPassword
  Write staging.basic-auth even though the live site refuses the password in OpenTofu (changing it on purpose).

.PARAMETER Identity
  The admin private key. Default: ~\.ssh\tectonic_box
#>
param(
    [switch]$Write,
    [ValidateSet("", "staging", "production")][string]$Only = "",
    [switch]$NewStagingPassword,
    [string]$Identity = "$env:USERPROFILE\.ssh\tectonic_box"
)
$ErrorActionPreference = "Stop"
$mode = if ($Write) { "write" } else { "check" }

if (-not (Test-Path $Identity)) { throw "no private key at $Identity (-Identity FILE)" }
if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) { throw "tofu is not on the PATH (run . .\infra\env.ps1 first)" }
Push-Location $PSScriptRoot
try { $outputs = (tofu output -json) -join "`n" | ConvertFrom-Json } finally { Pop-Location }
$hostAddress = $outputs.server_ipv4.value
if (-not $hostAddress) { throw "tofu has no server_ipv4 output: has it been applied?" }
if (-not $outputs.app_env.value.staging) { throw "tofu has no app_env output: run tofu apply first (README.md, `"App settings and secrets`")" }
$syncScript = (Get-Content (Join-Path $PSScriptRoot "env-sync.sh") -Raw) -replace "`r`n", "`n"

$knownHosts = Join-Path $env:TEMP ("tofu_known_hosts_" + [Guid]::NewGuid().ToString("N"))
Set-Content -Path $knownHosts -Value $outputs.known_hosts_line.value -Encoding ascii

# Runs a command on the box as the deploy user, sending $InputText on its standard input (see push-backup-env.ps1: Windows
# PowerShell adds a byte-order mark and may add carriage returns, which the receiving command strips).
function Invoke-Box([string]$Command, [string]$InputText = "") {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ssh"
    $psi.Arguments = "-o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=`"$knownHosts`" -i `"$Identity`" deploy@$hostAddress `"$($Command -replace '"','\"')`""
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    if ($InputText) { $p.StandardInput.Write($InputText) }
    $p.StandardInput.Close()
    $stdout = $p.StandardOutput.ReadToEnd(); $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    [pscustomobject]@{ ExitCode = $p.ExitCode; Output = $stdout.TrimEnd(); Error = $stderr.Trim() }
}

# One file through env-sync.sh on the box: the variables in front of the script, all on standard input.
function Sync-File([string]$Target, [string]$Contents) {
    $desired = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Contents -replace "`r`n", "`n")))
    $payload = "MODE=$mode ENV_DIR=/srv/tectonic/env TARGET=$Target DESIRED=$desired`n" + $syncScript
    $r = Invoke-Box "sed 's/\xEF\xBB\xBF//g' | tr -d '\015' | bash -s" $payload
    if ($r.Output) { Write-Host $r.Output }
    if ($r.ExitCode -ne 0) { throw "env-sync failed for $Target : $($r.Error)" }
}

# Whether the password logs in to the live site: "ok", "wrong" (a 401) or "unknown".
function Test-StagingLogin($Login) {
    $pair = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($Login.user):$($Login.password)"))
    try {
        $null = Invoke-WebRequest -Uri "$($Login.url)/" -Headers @{ Authorization = "Basic $pair" } -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 20
        return "ok"
    } catch {
        $response = $_.Exception.Response
        if ($response -and [int]$response.StatusCode -eq 401) { return "wrong" }
        if ($response -and [int]$response.StatusCode -ge 300 -and [int]$response.StatusCode -lt 400) { return "ok" }
        return "unknown"
    }
}

try {
    $r = Invoke-Box "test -f /srv/tectonic/state/.bootstrapped && echo ready"
    if ($r.Output -ne "ready") { throw "the box at $hostAddress has not finished its first boot (see /var/log/cloud-init-output.log on it). $($r.Error)" }
    Write-Host "== the box at $hostAddress ($mode)"

    foreach ($environment in @("staging", "production")) {
        if ($Only -and $Only -ne $environment) { continue }
        Sync-File "$environment.env" $outputs.app_env.value.$environment

        if ($environment -eq "staging") {
            $login = $outputs.staging_login.value
            $result = Test-StagingLogin $login
            switch ($result) {
                "ok" { Write-Host "staging password: logs in to $($login.url)" }
                "wrong" { Write-Host "staging password: does NOT log in to $($login.url) (the live one is different)" }
                default { Write-Host "staging password: could not check $($login.url)" }
            }
            # Only a password the live site refuses holds the file back: changing staging's password is done on purpose.
            if ($Write -and $result -eq "wrong" -and -not $NewStagingPassword) {
                Write-Host "  left staging.basic-auth as it is: pass -NewStagingPassword to change staging's password on purpose"
            } else {
                Sync-File "staging.basic-auth" $outputs.staging_basic_auth.value
            }
        }
    }

    Write-Host ""
    if ($Write) { Write-Host "Each environment's containers pick these up at its next deploy." }
    else { Write-Host "Nothing was changed. Run again with -Write to replace the files." }
} finally {
    Remove-Item $knownHosts -Force -ErrorAction SilentlyContinue
}
