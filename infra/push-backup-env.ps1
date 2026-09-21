<#
.SYNOPSIS
  Puts the backup credentials tofu created onto the box, as staging.backup.env and production.backup.env.

.DESCRIPTION
  The PowerShell twin of push-backup-env.sh (which needs bash and jq). Run it from a window where `. .\infra\env.ps1` has been run,
  because it reads `tofu output`. It trusts the server by the SSH host key tofu generated (never by what the network answers), keeps
  a BACKUP_PING_URL already set on the box, sends the secrets over ssh's standard input (never on a command line), and finishes by
  checking the box can write to the bucket (a test object, removed again).

.PARAMETER Identity
  The admin private key. Default: ~\.ssh\tectonic_box

.PARAMETER FromJson
  Read `tofu output -json` from this file instead of running tofu (for testing).

.PARAMETER Directory
  Where on the box to write the files. Default: /srv/tectonic/env (the test uses /tmp).

.PARAMETER SkipBucketCheck
  Skip the final write/read/delete test (for testing).
#>
param(
    [string]$Identity = "$env:USERPROFILE\.ssh\tectonic_box",
    [string]$FromJson = "",
    [string]$Directory = "/srv/tectonic/env",
    [switch]$SkipBucketCheck
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Identity)) { throw "no private key at $Identity (-Identity FILE)" }
if ($FromJson) {
    $outputs = Get-Content $FromJson -Raw | ConvertFrom-Json
} else {
    if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) { throw "tofu is not on the PATH (run . .\infra\env.ps1 first)" }
    Push-Location $PSScriptRoot
    try { $outputs = (tofu output -json) -join "`n" | ConvertFrom-Json } finally { Pop-Location }
}
$hostAddress = $outputs.server_ipv4.value
if (-not $hostAddress) { throw "tofu has no server_ipv4 output: has it been applied?" }

$knownHosts = Join-Path $env:TEMP ("tofu_known_hosts_" + [Guid]::NewGuid().ToString("N"))
Set-Content -Path $knownHosts -Value $outputs.known_hosts_line.value -Encoding ascii

# Runs a command on the box as the deploy user, sending $InputText (if any) on its standard input. Windows PowerShell's pipe and
# .NET's stream writer both add a byte-order mark (and PowerShell may add Windows line endings), and this .NET version cannot be
# told not to, so the receiving command strips them (see $write below): a secret must arrive byte for byte.
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
    [pscustomobject]@{ ExitCode = $p.ExitCode; Output = $stdout.Trim(); Error = $stderr.Trim() }
}

try {
    Write-Host "checking the box at $hostAddress has finished its first boot"
    $r = Invoke-Box "test -f /srv/tectonic/state/.bootstrapped && echo ready"
    if ($r.Output -ne "ready") { throw "the box has not finished bootstrapping yet (or cloud-init failed: see /var/log/cloud-init-output.log on it). $($r.Error)" }

    foreach ($environment in @("staging", "production")) {
        $content = $outputs.backup_env.value.$environment
        if (-not $content) { throw "tofu has no backup_env for $environment" }
        $target = "$Directory/$environment.backup.env"

        # Keep a ping URL someone set by hand: tofu does not know it.
        $existing = (Invoke-Box "sed -n 's/^BACKUP_PING_URL=//p' $target 2>/dev/null; true").Output
        if ($existing) { $content = $content -replace "(?m)^BACKUP_PING_URL=.*$", "BACKUP_PING_URL=$existing" }

        # sed removes any byte-order mark (EF BB BF), tr any carriage return, whatever the client added on the way.
        $write = "umask 077 && mkdir -p $Directory && sed 's/\xEF\xBB\xBF//g' | tr -d '\015' > $target.tmp && chmod 640 $target.tmp && mv $target.tmp $target"
        $w = Invoke-Box $write (($content -replace "`r`n", "`n").TrimEnd() + "`n")
        if ($w.ExitCode -ne 0) { throw "could not write $target : $($w.Error)" }
        $kept = ""; if ($existing) { $kept = " (kept its BACKUP_PING_URL)" }
        Write-Host "wrote $target$kept"
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
    Remove-Item $knownHosts -Force -ErrorAction SilentlyContinue
}
