[CmdletBinding()]
param([string]$ReleaseTag)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
    $branch = git branch --show-current
    if ($branch -ne 'techpanda-custom') { throw "Switch to techpanda-custom first (current branch: $branch)." }
    if ((git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }).Count -gt 0) { throw 'Commit or stash tracked changes before merging an upstream release.' }

    # Fetch immutable tags without pruning or rewriting upstream history.
    git fetch origin --tags
    if ($LASTEXITCODE) { throw 'Could not fetch upstream tags.' }
    if (-not $ReleaseTag) {
        $tags = git ls-remote --refs --tags origin 'refs/tags/v*' | ForEach-Object {
            if ($_ -match 'refs/tags/(v\d+\.\d+\.\d+)$') { [pscustomobject]@{ Name = $Matches[1]; Version = [version]$Matches[1].Substring(1) } }
        }
        $ReleaseTag = ($tags | Sort-Object Version -Descending | Select-Object -First 1).Name
    }
    if (-not $ReleaseTag -or $ReleaseTag -notmatch '^v\d+\.\d+\.\d+$') { throw "No stable upstream release tag found: $ReleaseTag" }
    if (-not (git tag --list $ReleaseTag)) { throw "Fetched release tag $ReleaseTag is not present locally." }
    Write-Host "Merging official $ReleaseTag into techpanda-custom..."
    git merge --no-ff --no-edit $ReleaseTag
    if ($LASTEXITCODE) { throw 'Merge failed or has conflicts. Resolve conflicts, then run registry verification, build, and tests.' }

    python techpanda/furniture/verify_registry.py --upstream-tag $ReleaseTag
    if ($LASTEXITCODE) { throw 'The TechPanda registry overlay or an official key was lost; inspect the merge before proceeding.' }
    Import-Module (Join-Path $root 'scripts/NeonPlan.Dev.psm1') -Force -DisableNameChecking
    Build-NeonPlan
    Test-NeonPlan
    Write-Host "Upstream merge $ReleaseTag built and tested. No remote deployment was performed."
}
finally { Pop-Location }
