Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:SourceRoot = Join-Path $script:RepoRoot 'techpanda/furniture'
$script:OutputRoot = Join-Path $script:SourceRoot 'dist'
$script:Tool = Join-Path $script:RepoRoot 'tools/fp3dpack.py'

function Get-NeonFurnitureKey {
    $key = $env:NEONPLAN_SIGNING_KEY
    if (-not $key) { $key = Join-Path $env:USERPROFILE 'Documents/TechPanda/NeonPlan3D/keys/techpanda-ed25519.pem' }
    if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw "Private signing key not found: $key. Set NEONPLAN_SIGNING_KEY to its external path." }
    $repoPrefix = $script:RepoRoot.TrimEnd('\') + '\'
    if ((Resolve-Path -LiteralPath $key).Path.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private signing key must stay outside the repository.' }
    return (Resolve-Path -LiteralPath $key).Path
}

function Build-NeonFurniture([Parameter(Mandatory)][string]$Source, [string]$Output) {
    $sourcePath = (Resolve-Path -LiteralPath $Source).Path
    if (-not $Output) { $Output = Join-Path $script:OutputRoot (([IO.Path]::GetFileNameWithoutExtension($sourcePath)) + '.fp3dpack') }
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output)
    python $script:Tool sign $sourcePath --key (Get-NeonFurnitureKey) --out $Output
    if ($LASTEXITCODE) { throw 'Pack schema validation or signing failed.' }
    Test-NeonFurniturePack -Pack $Output
}

function Test-NeonFurniturePack([Parameter(Mandatory)][string]$Pack) {
    $packPath = (Resolve-Path -LiteralPath $Pack).Path
    python $script:Tool verify $packPath
    if ($LASTEXITCODE) { throw 'NeonPlan pack signature/content verification failed.' }
}

function Test-NeonFurniturePackSecurity([Parameter(Mandatory)][string]$Source) {
    $signed = Join-Path $script:OutputRoot 'security-test.fp3dpack'
    Build-NeonFurniture -Source $Source -Output $signed | Out-Host
    python (Join-Path $script:SourceRoot 'test_security.py') $signed
    if ($LASTEXITCODE) { throw 'Custom pack signature test failed.' }
}

function Preview-NeonFurniturePack([Parameter(Mandatory)][string]$Source, [string]$OutputDirectory) {
    $sourcePath = (Resolve-Path -LiteralPath $Source).Path
    if (-not $OutputDirectory) { $OutputDirectory = Join-Path $script:OutputRoot 'previews' }
    node (Join-Path $script:SourceRoot 'preview.mjs') $sourcePath $OutputDirectory
    if ($LASTEXITCODE) { throw 'Local 3D preview failed.' }
}

Export-ModuleMember -Function Build-NeonFurniture, Test-NeonFurniturePack, Test-NeonFurniturePackSecurity, Preview-NeonFurniturePack
