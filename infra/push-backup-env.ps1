<#
.SYNOPSIS
  Puts the backup credentials tofu created (r2.tf) onto the box, as staging.backup.env and production.backup.env. Checks only,
  unless -Write.

.DESCRIPTION
  The PowerShell twin of push-backup-env.sh (which needs bash and jq). Run it from a window where `. .\infra\env.ps1` has been run,
  because it reads `tofu output`. The last step of a build or rebuild (infra/README.md), and safe to run again.

  Like push-env, it only CHECKS by default: for each file it lists, by name and never by value, which settings are the same as the
  box's, different, new or only on the box. Those are kept, so a BACKUP_PING_URL (or any optional setting) set on the box survives.
  -Write then replaces the files, keeping each previous one as FILE.bak, and checks the box can write to the bucket (a test object,
  removed again).

  The comparing and writing happen on the box, in env-sync.sh, which box.ps1 sends over ssh's standard input with the new
  contents base64-encoded: no secret is ever on a command line. It trusts the server by the SSH host key tofu generated.

.PARAMETER Write
  Replace the files. Without it, nothing on the box changes.

.PARAMETER Identity
  The admin private key. Default: ~\.ssh\tectonic_box

.PARAMETER FromJson
  Read `tofu output -json` from this file instead of running tofu (for testing).

.PARAMETER SkipBucketCheck
  Skip the final write/read/delete test (for testing).
#>
param(
    [switch]$Write,
    [string]$Identity = "$env:USERPROFILE\.ssh\tectonic_box",
    [string]$FromJson = "",
    [switch]$SkipBucketCheck
)
$ErrorActionPreference = "Stop"
$mode = if ($Write) { "write" } else { "check" }
. (Join-Path $PSScriptRoot "box.ps1")

Initialize-Box -Identity $Identity -FromJson $FromJson

try {
    foreach ($environment in @("staging", "production")) {
        $content = $outputs.backup_env.value.$environment
        if (-not $content) { throw "tofu has no backup_env for $environment : has it been applied?" }
        # State from before r2.tf stopped rendering a blank one: pushing it would blank the box's own BACKUP_PING_URL.
        if ($content -match "(?m)^BACKUP_PING_URL=") { throw "tofu's backup_env still renders BACKUP_PING_URL (state from before r2.tf stopped doing so): run tofu apply first" }
    }
    Assert-BoxBootstrapped
    Write-Host "== the box at $hostAddress ($mode)"

    foreach ($environment in @("staging", "production")) {
        Sync-BoxFile -Mode $mode -Target "$environment.backup.env" -Contents $outputs.backup_env.value.$environment
    }

    if (-not $Write) {
        Write-Host ""
        Write-Host "Nothing was changed. Run again with -Write to replace the files."
        return
    }

    if (-not $SkipBucketCheck) {
        Write-Host "checking the box can write to the bucket (a test object, removed again)"
        $test = @'
cd /srv/tectonic/env && for e in staging production; do
  if docker run --rm --env-file "$e.backup.env" -v /srv/tectonic/deploy:/deploy:ro --entrypoint sh rclone/rclone:1.75.1 -c '. /deploy/rclone-env.sh && t=backup:$BACKUP_BUCKET/$BACKUP_PREFIX/_connection-test.txt && printf hello | rclone rcat $t 2>/dev/null && [ "$(rclone cat $t 2>/dev/null)" = hello ] && rclone deletefile $t 2>/dev/null' >/dev/null 2>&1; then echo "  $e: ok"; else echo "  $e: FAILED"; fi
done
'@
        # The script arrives on stdin, so it gets the same byte-order mark as the secrets did: strip it, or bash fails on the first line.
        $c = Invoke-Box "sed 's/\xEF\xBB\xBF//g' | tr -d '\015' | bash -s" $test
        Write-Host $c.Output
        # Silence is not success: both environments must say ok, or something (a stripped line, a missing image) went wrong.
        if ($c.Output -notmatch "staging: ok" -or $c.Output -notmatch "production: ok") { throw "the box could not confirm it can write to the bucket. $($c.Error)" }
    }
    Write-Host "done"
} finally {
    Close-Box
}
