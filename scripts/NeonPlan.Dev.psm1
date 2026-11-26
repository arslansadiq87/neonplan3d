Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:Integration = Join-Path $script:RepoRoot 'custom_components/neonplan3d'
$script:RemoteAlias = 'homeassistant'
$script:RemotePath = '/var/lib/homeassistant/homeassistant/custom_components/neonplan3d'
$script:HostKey = 'ssh-ed25519 255 SHA256:A+F9DQsWnhZWN0WUkapBrk9lGdnZqm0JHYT360dDUfg'
$script:BackupRoot = Join-Path $script:RepoRoot '.local/neonplan3d-backups'
function Get-NeonPlanAuthArgs {
    $key = $env:NEONPLAN_SSH_KEY
    if (-not $key) { $key = Join-Path $env:USERPROFILE '.ssh/homeassistant' }
    if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw "Dedicated OpenSSH key not found: $key. Set NEONPLAN_SSH_KEY to its external path." }
    $repoPrefix = $script:RepoRoot.TrimEnd('\') + '\'
    if ((Resolve-Path -LiteralPath $key).Path.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'SSH private key must stay outside the repository.' }
    return @('-i', (Resolve-Path -LiteralPath $key).Path)
}

function Test-NeonPlanPinnedHostKey {
    $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
    $keygen = (Get-Command ssh-keygen.exe -ErrorAction Stop).Source
    $config = & $ssh -G $script:RemoteAlias 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve SSH alias configuration.' }
    $hostLine = $config | Where-Object { $_ -match '^hostname\s+' } | Select-Object -First 1
    if (-not $hostLine) { throw 'SSH alias did not resolve to a host name.' }
    $hostname = ($hostLine -split '\s+', 2)[1]
    $known = & $keygen -F $hostname 2>$null
    $entry = $known | Where-Object { $_ -and $_ -notmatch '^#' } | Select-Object -First 1
    if (-not $entry) { throw "No known SSH host key for $hostname; refusing remote access." }
    $fields = $entry -split '\s+'
    if ($fields[1] -ne 'ssh-ed25519') { throw "Unexpected SSH host-key algorithm for $hostname." }
    $raw = [Convert]::FromBase64String($fields[2])
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $digest = $sha.ComputeHash($raw) } finally { $sha.Dispose() }
    $fingerprint = [Convert]::ToBase64String($digest).TrimEnd('=')
    $expected = ($script:HostKey -split 'SHA256:', 2)[1]
    if ($fingerprint -ne $expected) { throw "SSH host-key fingerprint mismatch for $hostname; refusing remote access." }
}

function Get-NeonPlanVersion([string]$Path) {
    return (Get-Content -Raw -LiteralPath (Join-Path $Path 'manifest.json') | ConvertFrom-Json).version
}

function Get-NeonPlanDeployArtifact {
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $script:Integration 'manifest.json') | ConvertFrom-Json
    $release = Get-Content -Raw -LiteralPath (Join-Path $script:RepoRoot 'techpanda/release.json') | ConvertFrom-Json
    if ($manifest.version -ne $release.downstream_version) { throw 'Integration manifest and TechPanda release metadata disagree.' }
    $artifact = Join-Path $script:RepoRoot 'techpanda/dist/neonplan3d.zip'
    $stage = Join-Path $script:RepoRoot '.local/neonplan3d-release-stage'
    $upstreamCache = Join-Path $script:RepoRoot ('.local/upstream-release-cache/' + $release.upstream_tag)
    $upstreamZip = Join-Path $upstreamCache 'neonplan3d.zip'
    $null = New-Item -ItemType Directory -Force -Path $upstreamCache
    & gh release download $release.upstream_tag --repo $release.upstream --pattern 'neonplan3d.zip' --dir $upstreamCache --clobber
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $upstreamZip)) { throw "Could not download official baseline asset $($release.upstream) $($release.upstream_tag)." }
    if (Test-Path -LiteralPath $stage) {
        $full = [IO.Path]::GetFullPath($stage)
        $localRoot = [IO.Path]::GetFullPath((Join-Path $script:RepoRoot '.local')) + [IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($localRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove staging outside .local.' }
        Remove-Item -LiteralPath $full -Recurse -Force
    }
    Expand-Archive -LiteralPath $upstreamZip -DestinationPath $stage -Force
    $baseManifest = Get-Content -Raw -LiteralPath (Join-Path $stage 'manifest.json') | ConvertFrom-Json
    if ($baseManifest.version -ne $release.upstream_version) { throw "Downloaded baseline version $($baseManifest.version) does not match metadata $($release.upstream_version)." }
    foreach ($relative in $release.runtime_overlay_paths) {
        $sourceFile = Join-Path $script:Integration $relative
        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Runtime overlay file is missing: $relative" }
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $stage $relative) -Force
    }
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $artifact)
    if (Test-Path -LiteralPath $artifact) { Remove-Item -LiteralPath $artifact -Force }
    $packager = Join-Path $script:RepoRoot 'tools/package_hacs_release.py'
    & python $packager $stage $artifact
    if ($LASTEXITCODE -ne 0) { throw 'Platform-independent HACS ZIP packaging/validation failed.' }
    Write-Output "HACS integration artifact created from official $($release.upstream_tag) baseline with $($release.runtime_overlay_paths.Count) inventoried runtime overlays (version $($manifest.version))."
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
    Test-NeonPlanPinnedHostKey
    $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
    $auth = Get-NeonPlanAuthArgs
    $out = & $ssh @auth -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 $script:RemoteAlias $Command 2>&1
    if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) { throw "SSH command failed ($LASTEXITCODE): $out" }
    return $out
}

function Invoke-NeonPlanScp([string[]]$Arguments) {
    Test-NeonPlanPinnedHostKey
    $scp = (Get-Command scp.exe -ErrorAction Stop).Source
    $auth = Get-NeonPlanAuthArgs
    $recursive = $Arguments -contains '-r'
    $positionals = [Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt $Arguments.Count; $i++) {
        switch ($Arguments[$i]) {
            '-batch' { continue }
            '-r' { continue }
            '-hostkey' {
                $i++
                if ($Arguments[$i] -ne $script:HostKey) { throw 'SCP host-key pin differs from the approved server key.' }
                continue
            }
            '-l' {
                $i++
                if ($Arguments[$i] -ne 'root') { throw 'Only the configured root SSH account is allowed.' }
                continue
            }
            default { $positionals.Add($Arguments[$i]) }
        }
    }
    if ($positionals.Count -ne 2) { throw 'Expected exactly one SCP source and destination.' }
    $flags = @(@('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10') + $auth)
    if ($recursive) { $flags += '-r' }
    $out = & $scp @flags $positionals[0] $positionals[1] 2>&1
    if ($LASTEXITCODE -ne 0) { throw "SCP failed ($LASTEXITCODE): $out" }
}

function Test-NeonPlanRemote {
    $localVersion = Get-NeonPlanVersion $script:Integration
    $release = Get-Content -Raw -LiteralPath (Join-Path $script:RepoRoot 'techpanda/release.json') | ConvertFrom-Json
    $remoteManifest = Invoke-NeonPlanPlink "cat $script:RemotePath/manifest.json"
    $remoteVersion = (($remoteManifest -join "`n") | ConvertFrom-Json).version
    if ($remoteVersion -ne $localVersion -and $remoteVersion -ne $release.upstream_version) { throw "Installed version $remoteVersion is neither upstream baseline $($release.upstream_version) nor downstream target $localVersion. Stop and review compatibility." }
    $info = Invoke-NeonPlanPlink 'printf ''OS=''; . /etc/os-release; printf ''%s %s '' "$ID" "$VERSION_ID"; printf ''ARCH=''; uname -m; printf ''CONTAINER=''; docker inspect -f ''{{.Config.Image}}'' homeassistant; printf ''SUPERVISOR=''; docker ps --format ''{{.Names}}'' | grep -E ''^hassio_supervisor$'' || true'
    Write-Output "Downstream target: $localVersion; installed: $remoteVersion; official baseline: $($release.upstream_tag)"
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
    $remoteParent = $script:RemotePath.Substring(0, $script:RemotePath.LastIndexOf('/'))
    $null = Invoke-NeonPlanPlink "test -d '$script:RemotePath' && tar -C '$remoteParent' -czf /tmp/neonplan3d-remote-backup.tar.gz neonplan3d && sha256sum /tmp/neonplan3d-remote-backup.tar.gz"
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
    foreach ($line in $remote) {
        # GNU sha256sum prefixes escaped filenames with a backslash and doubles
        # embedded backslashes. Decode that representation without treating a
        # real Linux backslash filename as a valid directory separator.
        if ($line -match '^\\?([0-9a-f]{64})\s+\*?(.*)$') {
            $name = $Matches[2].Replace('\\','\').TrimStart('./')
            $remoteMap[$name] = $Matches[1]
        }
    }
    $drift = @()
    $releaseStage = Join-Path $script:RepoRoot '.local/neonplan3d-release-stage'
    $compareRoot = if (Test-Path -LiteralPath (Join-Path $releaseStage 'manifest.json')) { $releaseStage } else { $script:Integration }
    foreach ($f in Get-NeonPlanFiles $compareRoot) {
        $rel = Get-NeonPlanRelative $compareRoot $f.FullName
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
    Get-NeonPlanDeployArtifact | Out-Host
    Test-NeonPlanRemote
    $remoteManifest = Invoke-NeonPlanPlink "cat $script:RemotePath/manifest.json"
    $remoteVersion = (($remoteManifest -join "`n") | ConvertFrom-Json).version
    $preflight = @(Compare-NeonPlanRemote)
    $changed = @($preflight | Where-Object { $_ -match '^(MISSING|DIFF)' })
    $extras = @($preflight | Where-Object { $_ -match '^REMOTE-ONLY' })
    $targetVersion = Get-NeonPlanVersion $script:Integration
    if ($remoteVersion -eq $targetVersion -and $changed.Count -eq 0) {
        Write-Output "NeonPlan $targetVersion is already installed and matches the customized release; skipping duplicate deployment."
        return
    }
    if ($changed.Count -and -not $ApproveCompatibilityDrift) { throw "Remote integration differs in $($changed.Count) local paths. Review Compare-NeonPlanRemote and upstream history; pass -ApproveCompatibilityDrift only if intentionally replacing these paths." }
    if ($extras.Count -and -not $ApproveCompatibilityDrift) { throw "Remote integration has $($extras.Count) extra files that will be preserved. Review Compare-NeonPlanRemote and pass -ApproveCompatibilityDrift to confirm the scoped overlay." }
    $null = Backup-NeonPlan
    $stage = '/tmp/neonplan3d-stage-' + [guid]::NewGuid().ToString('N')
    $null = Invoke-NeonPlanPlink "mkdir -m 700 $stage"
    $releaseStage = Join-Path $script:RepoRoot '.local/neonplan3d-release-stage'
    foreach ($entry in Get-ChildItem -LiteralPath $releaseStage -Force) {
        Invoke-NeonPlanScp @('-batch','-hostkey',$script:HostKey,'-r','-l','root',$entry.FullName,"$($script:RemoteAlias):$stage/")
    }
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
