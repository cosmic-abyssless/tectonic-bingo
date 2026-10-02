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

  The comparing and writing happen on the box, in env-sync.sh, which box.ps1 sends over ssh's standard input with the new
  contents base64-encoded: no secret is ever on a command line. It trusts the server by the SSH host key tofu generated.

.PARAMETER Write
  Replace the files. Without it, nothing on the box changes.

.PARAMETER Only
  Just one environment: staging or production.

.PARAMETER NewStagingPassword
  Write staging.basic-auth even though the password in OpenTofu was not confirmed against the live site (refused, or the site
  could not be reached): changing it on purpose. A box with no staging.basic-auth yet gets it without this.

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
. (Join-Path $PSScriptRoot "box.ps1")

Initialize-Box -Identity $Identity

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
    if (-not $outputs.app_env.value.staging) { throw "tofu has no app_env output: run tofu apply first (README.md, `"App settings and secrets`")" }
    Assert-BoxBootstrapped
    Write-Host "== the box at $hostAddress ($mode)"

    foreach ($environment in @("staging", "production")) {
        if ($Only -and $Only -ne $environment) { continue }
        $appEnv = $outputs.app_env.value.$environment
        if (-not $appEnv) { throw "tofu has no app_env for $environment : run tofu apply first" }
        Sync-BoxFile -Mode $mode -Target "$environment.env" -Contents $appEnv

        if ($environment -eq "staging") {
            $login = $outputs.staging_login.value
            $result = Test-StagingLogin $login
            switch ($result) {
                "ok" { Write-Host "staging password: logs in to $($login.url)" }
                "wrong" { Write-Host "staging password: does NOT log in to $($login.url) (the live one is different)" }
                default { Write-Host "staging password: could not check $($login.url)" }
            }
            # Written only when the password is known to be right (it logs in), when the box has none yet (a new box), or when it
            # is being changed on purpose; never on a guess, since a site that cannot be reached proves nothing about a typo.
            $hasAuth = (Invoke-Box "test -f /srv/tectonic/env/staging.basic-auth && echo yes").Output -eq "yes"
            if (-not $Write -or $result -eq "ok" -or -not $hasAuth -or $NewStagingPassword) {
                Sync-BoxFile -Mode $mode -Target "staging.basic-auth" -Contents $outputs.staging_basic_auth.value
            } else {
                Write-Host "  left staging.basic-auth as it is (the password was not confirmed): pass -NewStagingPassword to change it on purpose"
            }
        }
    }

    Write-Host ""
    if ($Write) { Write-Host "Each environment's containers pick these up at its next deploy." }
    else { Write-Host "Nothing was changed. Run again with -Write to replace the files." }
} finally {
    Close-Box
}
