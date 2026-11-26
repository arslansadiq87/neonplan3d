$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$baseTag = 'v4.0.2'
$tempBase = [IO.Path]::GetFullPath((Join-Path $env:TEMP 'neonplan-update-simulation'))
$temp = Join-Path $tempBase ([guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Force -Path $tempBase

try {
    git clone --shared --no-checkout $root $temp
    if ($LASTEXITCODE) { throw 'Could not create temporary repository for merge simulation.' }
    git -C $temp config user.name 'NeonPlan merge simulation'
    git -C $temp config user.email 'neonplan-simulation@localhost'
    git -C $temp checkout -b downstream-sim $baseTag
    if ($LASTEXITCODE) { throw 'Could not check out baseline tag in simulation.' }
    Copy-Item -LiteralPath (Join-Path $root 'custom_components/neonplan3d/packs.py') -Destination (Join-Path $temp 'custom_components/neonplan3d/packs.py') -Force
    git -C $temp add custom_components/neonplan3d/packs.py
    git -C $temp -c user.name='TechPanda Test' -c user.email='test@localhost' commit -m 'Simulate downstream publisher key overlay' | Out-Null
    if ($LASTEXITCODE) { throw 'Could not commit simulated downstream overlay.' }

    git -C $temp checkout -b upstream-release-sim $baseTag
    if ($LASTEXITCODE) { throw 'Could not create synthetic upstream release branch.' }
    $upstreamFile = Join-Path $temp 'custom_components/neonplan3d/packs.py'
    $text = [IO.File]::ReadAllText($upstreamFile)
    $text = $text.Replace('MAX_PACK_SIZE = 1_000_000', 'MAX_PACK_SIZE = 1_000_001')
    if ($text -notmatch 'MAX_PACK_SIZE = 1_000_001') { throw 'Synthetic upstream change did not apply.' }
    [IO.File]::WriteAllText($upstreamFile, $text, [Text.UTF8Encoding]::new($false))
    git -C $temp add custom_components/neonplan3d/packs.py
    git -C $temp -c user.name='Upstream Test' -c user.email='upstream@localhost' commit -m 'Simulate unrelated upstream pack schema update' | Out-Null
    if ($LASTEXITCODE) { throw 'Could not commit synthetic upstream update.' }

    git -C $temp checkout downstream-sim
    git -C $temp merge --no-edit upstream-release-sim | Out-Null
    if ($LASTEXITCODE) { throw 'Synthetic merge failed; inspect temporary repository.' }
    $merged = Get-Content -Raw -LiteralPath $upstreamFile
    if ($merged -notmatch '4d62b4e84557' -or $merged -notmatch 'MAX_PACK_SIZE = 1_000_001') { throw 'The merge lost custom registration or the synthetic upstream change.' }
    Write-Output 'PASS: downstream TechPanda registry overlay survived a synthetic upstream release merge.'
}
finally {
    $fullTemp = [IO.Path]::GetFullPath($temp)
    if (-not $fullTemp.StartsWith($tempBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove a path outside the dedicated simulation temp root.' }
    if (Test-Path -LiteralPath $fullTemp) { Remove-Item -LiteralPath $fullTemp -Recurse -Force }
}
