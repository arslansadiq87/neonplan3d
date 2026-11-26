Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:Integration = Join-Path $script:RepoRoot 'custom_components/neonplan3d'
$script:RemoteAlias = 'homeassistant'
$script:RemotePath = '/var/lib/homeassistant/homeassistant/custom_components/neonplan3d'
$script:HostKey = 'ssh-ed25519 255 SHA256:A+F9DQsWnhZWN0WUkapBrk9lGdnZqm0JHYT360dDUfg'
$script:BackupRoot = Join-Path $script:RepoRoot '.local/neonplan3d-backups'
$script:SshPassword = $null

function Get-NeonPlanAuthArgs {
    $key = $env:NEONPLAN_SSH_KEY
    if ($key) {
        if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw "SSH key not found: $key" }
        return @('-i', $key)
    }
    if (-not $script:SshPassword) {
        $secure = Read-Host "SSH password for root@$script:RemoteAlias (or set NEONPLAN_SSH_KEY)" -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $script:SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
    return @('-pw', $script:SshPassword)
}

function Get-NeonPlanVersion([string]$Path) {
    return (Get-Content -Raw -LiteralPath (Join-Path $Path 'manifest.json') | ConvertFrom-Json).version
}

function Get-NeonPlanDeployArtifact {
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $script:Integration 'manifest.json') | ConvertFrom-Json
    $artifact = Join-Path $script:RepoRoot 'techpanda/dist/neonplan3d.zip'
    $stage = Join-Path $script:RepoRoot '.local/neonplan3d-release-stage'
    if (Test-Path -LiteralPath $stage) {
        $full = [IO.Path]::GetFullPath($stage)
        $localRoot = [IO.Path]::GetFullPath((Join-Path $script:RepoRoot '.local')) + [IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($localRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove staging outside .local.' }
        Remove-Item -LiteralPath $full -Recurse -Force
    }
    $null = New-Item -ItemType Directory -Force -Path $stage
    Copy-Item -LiteralPath $script:Integration -Destination (Join-Path $stage 'neonplan3d') -Recurse
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $artifact)
    if (Test-Path -LiteralPath $artifact) { Remove-Item -LiteralPath $artifact -Force }
    Compress-Archive -Path (Join-Path $stage 'neonplan3d') -DestinationPath $artifact -CompressionLevel Optimal
    Write-Output "HACS integration artifact created: $artifact (manifest version $($manifest.version); publish as a downstream-only prerelease after testing)."
    Get-FileHash -LiteralPath $artifact -Algorithm SHA256
}

function Get-NeonPlanFiles([string]$Path) {
    return Get-ChildItem -LiteralPath $Path -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/](__pycache__)[\\/]' -and $_.Extension -ne '.pyc' }
}

function Get-NeonPlanRelative([string]$Root, [string]$File) {
    $rootUri = [Uri]::new(($Root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar))
    $fileUri = [Uri]::new($File)
    return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString()).Replace('\\','/')
}

function Invoke-NeonPlanPlink([string]$Command, [switch]$AllowFailure) {
    $plink = (Get-Command plink.exe -ErrorAction Stop).Source
    $auth = Get-NeonPlanAuthArgs
    $out = & $plink -batch -ssh -l root @auth -hostkey $script:HostKey $script:RemoteAlias $Command 2>&1
    if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) { throw "SSH command failed ($LASTEXITCODE): $out" }
    return $out
}

function Invoke-NeonPlanScp([string[]]$Arguments) {
    $pscp = (Get-Command pscp.exe -ErrorAction Stop).Source
    $auth = Get-NeonPlanAuthArgs
    $out = & $pscp @auth @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "SCP failed ($LASTEXITCODE): $out" }
}

function Test-NeonPlanRemote {
    $localVersion = Get-NeonPlanVersion $script:Integration
    $remoteManifest = Invoke-NeonPlanPlink "cat $script:RemotePath/manifest.json"
    $remoteVersion = (($remoteManifest -join "`n") | ConvertFrom-Json).version
    if ($remoteVersion -ne $localVersion) { throw "Version mismatch: local $localVersion; remote $remoteVersion. Review upstream changes before deployment." }
    $info = Invoke-NeonPlanPlink 'printf ''OS=''; . /etc/os-release; printf ''%s %s '' "$ID" "$VERSION_ID"; printf ''ARCH=''; uname -m; printf ''CONTAINER=''; docker inspect -f ''{{.Config.Image}}'' homeassistant; printf ''SUPERVISOR=''; docker ps --format ''{{.Names}}'' | grep -E ''^hassio_supervisor$'' || true'
    Write-Output "Local/remote NeonPlan: $localVersion"
    Write-Output ($info -join "`n")
}

function Build-NeonPlan {
    Push-Location (Join-Path $script:RepoRoot 'frontend')
    try { npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' }; npm run typecheck; if ($LASTEXITCODE) { throw 'typecheck failed' }; npm run build; if ($LASTEXITCODE) { throw 'build failed' } }
    finally { Pop-Location }
}

function Test-NeonPlan {
    $oldTimezone = $env:TZ
    try {
        $env:TZ = 'UTC'
        Push-Location (Join-Path $script:RepoRoot 'frontend')
        try { npm test; if ($LASTEXITCODE) { throw 'frontend tests failed' }; npm run typecheck; if ($LASTEXITCODE) { throw 'typecheck failed' } }
        finally { Pop-Location }
    }
    finally { if ($null -eq $oldTimezone) { Remove-Item Env:TZ -ErrorAction SilentlyContinue } else { $env:TZ = $oldTimezone } }
    python -m pytest; if ($LASTEXITCODE) { throw 'pytest failed' }
}

function Backup-NeonPlan {
    $null = Invoke-NeonPlanPlink "test -d $script:RemotePath && tar -C $(Split-Path $script:RemotePath -Parent) -czf /tmp/neonplan3d-remote-backup.tar.gz neonplan3d && sha256sum /tmp/neonplan3d-remote-backup.tar.gz"
    New-Item -ItemType Directory -Force -Path $script:BackupRoot | Out-Null
    $name = 'neonplan3d-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tar.gz'
    Invoke-NeonPlanScp @('-batch','-hostkey',$script:HostKey,'-l','root',"$($script:RemoteAlias):/tmp/neonplan3d-remote-backup.tar.gz",(Join-Path $script:BackupRoot $name))
    $localHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $script:BackupRoot $name)).Hash.ToLowerInvariant()
    $remoteHashLine = Invoke-NeonPlanPlink 'sha256sum /tmp/neonplan3d-remote-backup.tar.gz'
    $remoteHash = ([string]$remoteHashLine -split '\s+')[0]
    if ($localHash -ne $remoteHash) { throw 'Downloaded backup hash does not match remote archive; preserve both and investigate before proceeding.' }
    Invoke-NeonPlanPlink 'rm -f /tmp/neonplan3d-remote-backup.tar.gz' | Out-Null
    Write-Output "Backup saved: $(Join-Path $script:BackupRoot $name)"
}

function Compare-NeonPlanRemote {
    $remote = Invoke-NeonPlanPlink "cd $script:RemotePath && find . -type f ! -path '*/__pycache__/*' ! -name '*.pyc' -print0 | sort -z | xargs -0 sha256sum"
    $remoteMap = @{}
    foreach ($line in $remote) { if ($line -match '^([0-9a-f]{64})\s+\*?(.*)$') { $remoteMap[$Matches[2].TrimStart('./')] = $Matches[1] } }
    $drift = @()
    foreach ($f in Get-NeonPlanFiles $script:Integration) {
        $rel = Get-NeonPlanRelative $script:Integration $f.FullName
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash.ToLowerInvariant()
        if (-not $remoteMap.ContainsKey($rel)) { $drift += "MISSING $rel" } elseif ($remoteMap[$rel] -ne $hash) { $drift += "DIFF $rel" }
        $remoteMap.Remove($rel)
    }
    $drift += @($remoteMap.Keys | ForEach-Object { "REMOTE-ONLY (preserved) $_" })
    return $drift
}

function Deploy-NeonPlan([switch]$ApproveRemoteWrite, [switch]$ApproveCompatibilityDrift, [switch]$ApproveRestart) {
    if (-not $ApproveRemoteWrite) { throw 'Deployment requires -ApproveRemoteWrite after reviewing backup and compatibility.' }
    $hacsSourceMarker = Join-Path $script:RepoRoot '.local/hacs-source.txt'
    if (-not (Test-Path -LiteralPath $hacsSourceMarker -PathType Leaf)) { throw 'Deployment blocked: first switch HACS to the TechPanda fork, verify the source in HACS, then record its owner/repository in .local/hacs-source.txt. Official Mastershort updates can overwrite the custom key registry.' }
    $hacsSource = (Get-Content -Raw -LiteralPath $hacsSourceMarker).Trim()
    if ($hacsSource -notmatch '^[^/\s]+/[^/\s]+$' -or $hacsSource -ieq 'Mastershort/neonplan3d') { throw "Deployment blocked: HACS source marker is invalid or still official ($hacsSource)." }
    Test-NeonPlanRemote
    $preflight = @(Compare-NeonPlanRemote)
    $changed = @($preflight | Where-Object { $_ -match '^(MISSING|DIFF)' })
    $extras = @($preflight | Where-Object { $_ -match '^REMOTE-ONLY' })
    if ($changed.Count -and -not $ApproveCompatibilityDrift) { throw "Remote integration differs in $($changed.Count) local paths. Review Compare-NeonPlanRemote and upstream history; pass -ApproveCompatibilityDrift only if intentionally replacing these paths." }
    if ($extras.Count -and -not $ApproveCompatibilityDrift) { throw "Remote integration has $($extras.Count) extra files that will be preserved. Review Compare-NeonPlanRemote and pass -ApproveCompatibilityDrift to confirm the scoped overlay." }
    $null = Backup-NeonPlan
    $stage = '/tmp/neonplan3d-stage-' + [guid]::NewGuid().ToString('N')
    $null = Invoke-NeonPlanPlink "mkdir -m 700 $stage"
    Invoke-NeonPlanScp @('-batch','-hostkey',$script:HostKey,'-r','-l','root',"$($script:Integration)/*","$($script:RemoteAlias):$stage/")
    $copyCommand = 'find ' + $stage + ' -type f ! -path ''*/__pycache__/*'' ! -name ''*.pyc'' -exec sh -c ''f="$1"; rel=${f#' + $stage + '/}; mkdir -p "$(dirname ' + $script:RemotePath + '/$rel)"; cp -p "$f" ' + $script:RemotePath + '/"$rel"'' sh {} \;'
    $null = Invoke-NeonPlanPlink $copyCommand
    $diff = Compare-NeonPlanRemote
    if ($diff | Where-Object { $_ -match '^(MISSING|DIFF)' }) { throw "Post-copy verification failed: $($diff -join '; '). Restore the downloaded backup before proceeding." }
    Write-Output 'Integration files copied and hash-verified. Restart has not been requested.'
    if ($ApproveRestart) { Restart-NeonPlan }
}

function Restart-NeonPlan {
    $phrase = Read-Host 'Type RESTART HOME ASSISTANT to restart the Supervisor-managed Core'
    if ($phrase -cne 'RESTART HOME ASSISTANT') { throw 'Restart cancelled' }
    Invoke-NeonPlanPlink 'ha core restart' | Out-Null
    Write-Output 'Requested restart using the Supervisor-managed Home Assistant CLI.'
}

function Restore-NeonPlan([Parameter(Mandatory)][string]$Backup, [switch]$ApproveRemoteWrite, [switch]$ApproveRestart) {
    if (-not $ApproveRemoteWrite) { throw 'Rollback requires -ApproveRemoteWrite.' }
    $resolved = (Resolve-Path -LiteralPath $Backup).Path
    if (-not $resolved.StartsWith($script:BackupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Backup must be under $script:BackupRoot" }
    Invoke-NeonPlanScp @('-batch','-hostkey',$script:HostKey,'-l','root',$resolved,"$($script:RemoteAlias):/tmp/neonplan3d-restore.tar.gz")
    $null = Invoke-NeonPlanPlink "tar -tzf /tmp/neonplan3d-restore.tar.gz | grep -q '^neonplan3d/' && tar -C /var/lib/homeassistant/homeassistant/custom_components -xzf /tmp/neonplan3d-restore.tar.gz neonplan3d && rm -f /tmp/neonplan3d-restore.tar.gz"
    if ($ApproveRestart) { Restart-NeonPlan }
}

Export-ModuleMember -Function Build-NeonPlan, Test-NeonPlan, Test-NeonPlanRemote, Backup-NeonPlan, Compare-NeonPlanRemote, Get-NeonPlanDeployArtifact, Deploy-NeonPlan, Restore-NeonPlan, Restart-NeonPlan
