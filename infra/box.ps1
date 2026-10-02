# Shared by infra/push-env.ps1 and push-backup-env.ps1 (dot-sourced, not run): the PowerShell twin of box.sh. Reads OpenTofu's
# outputs, reaches the box over ssh, and sends one env file through env-sync.sh. Trusts the server by the host key tofu generated
# (output known_hosts_line), never by what the network answers, and sends every secret over ssh's standard input.
#
#   Initialize-Box -Identity FILE [-FromJson FILE]
#                            checks the key and tofu, reads `tofu output -json` (or FILE, for testing) into $outputs and the
#                            server's address into $hostAddress, and writes tofu's host key to a temporary known_hosts file
#   Invoke-Box COMMAND [INPUT]
#                            runs a command on the box as the deploy user, INPUT on its standard input
#   Assert-BoxBootstrapped   stops unless the box has finished its first boot
#   Sync-BoxFile -Mode check|write -Target NAME -Contents TEXT [-Directory DIR]
#                            runs env-sync.sh on the box for DIR/NAME (default /srv/tectonic/env)
#   Close-Box                removes the temporary known_hosts file: call it in a finally block

function Initialize-Box([string]$Identity, [string]$FromJson = "") {
    if (-not (Test-Path $Identity)) { throw "no private key at $Identity (-Identity FILE)" }
    if ($FromJson) {
        $script:outputs = Get-Content $FromJson -Raw | ConvertFrom-Json
    } else {
        if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) { throw "tofu is not on the PATH (run . .\infra\env.ps1 first)" }
        Push-Location $PSScriptRoot
        try { $script:outputs = (tofu output -json) -join "`n" | ConvertFrom-Json } finally { Pop-Location }
    }
    $script:hostAddress = $script:outputs.server_ipv4.value
    if (-not $script:hostAddress) { throw "tofu has no server_ipv4 output: has it been applied?" }
    $script:boxIdentity = $Identity
    $script:boxSyncScript = (Get-Content (Join-Path $PSScriptRoot "env-sync.sh") -Raw) -replace "`r`n", "`n"
    # Last, so nothing above can fail and leave it behind: from here on the caller's finally block runs Close-Box.
    $script:boxKnownHosts = Join-Path $env:TEMP ("tofu_known_hosts_" + [Guid]::NewGuid().ToString("N"))
    Set-Content -Path $script:boxKnownHosts -Value $script:outputs.known_hosts_line.value -Encoding ascii
}

function Close-Box {
    if ($script:boxKnownHosts) { Remove-Item $script:boxKnownHosts -Force -ErrorAction SilentlyContinue }
}

# Windows PowerShell's pipe and .NET's stream writer both add a byte-order mark (and PowerShell may add Windows line endings), and
# this .NET version cannot be told not to, so a command that reads $InputText strips them (see Sync-BoxFile): a secret must arrive
# byte for byte. The output keeps its leading spaces (env-sync indents its details) and loses only the trailing line break.
function Invoke-Box([string]$Command, [string]$InputText = "") {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ssh"
    $psi.Arguments = "-o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=`"$script:boxKnownHosts`" -i `"$script:boxIdentity`" deploy@$script:hostAddress `"$($Command -replace '"','\"')`""
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    if ($InputText) { $p.StandardInput.Write($InputText) }
    $p.StandardInput.Close()
    $stdout = $p.StandardOutput.ReadToEnd(); $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    [pscustomobject]@{ ExitCode = $p.ExitCode; Output = $stdout.TrimEnd(); Error = $stderr.Trim() }
}

function Assert-BoxBootstrapped {
    $r = Invoke-Box "test -f /srv/tectonic/state/.bootstrapped && echo ready"
    if ($r.Output -ne "ready") { throw "the box at $script:hostAddress has not finished its first boot (see /var/log/cloud-init-output.log on it). $($r.Error)" }
}

# The variables in front of the script, all on standard input, so no secret is ever on a command line. sed removes any
# byte-order mark (EF BB BF) and tr any carriage return that came along on the way.
function Sync-BoxFile([string]$Mode, [string]$Target, [string]$Contents, [string]$Directory = "/srv/tectonic/env") {
    $desired = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Contents -replace "`r`n", "`n")))
    $payload = "MODE=$Mode ENV_DIR=$Directory TARGET=$Target DESIRED=$desired`n" + $script:boxSyncScript
    $r = Invoke-Box "sed 's/\xEF\xBB\xBF//g' | tr -d '\015' | bash -s" $payload
    if ($r.Output) { Write-Host $r.Output }
    if ($r.ExitCode -ne 0) { throw "env-sync failed for $Target : $($r.Error)" }
}
