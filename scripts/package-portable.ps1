$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'The web app build failed.' }
  $maiaRuntime = Join-Path $projectRoot 'release-runtime\maia\maia3-uci\maia3-uci.exe'
  if (-not (Test-Path $maiaRuntime)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'package-maia.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'The Maia runtime packaging failed.' }
  }
  $builder = Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd'
  & $builder --win portable
  if ($LASTEXITCODE -ne 0) { throw 'Electron portable packaging failed.' }
} finally { Pop-Location }
