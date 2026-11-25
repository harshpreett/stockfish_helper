$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venvPath = Join-Path $projectRoot '.venv-maia-build'
$pythonPath = Join-Path $venvPath 'Scripts\python.exe'
$entryPath = Join-Path $projectRoot 'maia\entry.py'
$distPath = Join-Path $projectRoot 'release-runtime\maia'
$workPath = Join-Path $projectRoot '.build\pyinstaller'

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Build command failed: $Command $($Arguments -join ' ')" }
}

if (-not (Test-Path $pythonPath)) {
  if ($env:MAIA_BUILD_PYTHON -and (Test-Path $env:MAIA_BUILD_PYTHON)) {
    Invoke-Checked $env:MAIA_BUILD_PYTHON @('-m','venv',$venvPath)
  } else {
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pythonLauncher) {
      Invoke-Checked $pythonLauncher.Source @('-3.12','-m','venv',$venvPath)
    } else {
      $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
      if (-not $pythonCommand) { throw 'Python 3.12 is needed on the build computer to create the Maia bundle. The finished app will include Maia and will not need Python installed.' }
      Invoke-Checked $pythonCommand.Source @('-m','venv',$venvPath)
    }
  }
}

Invoke-Checked $pythonPath @('-m','pip','install','--upgrade','pip','setuptools','wheel')
Invoke-Checked $pythonPath @('-m','pip','install','torch','--index-url','https://download.pytorch.org/whl/cpu')
Invoke-Checked $pythonPath @('-m','pip','install','numpy','python-chess','huggingface-hub','pyinstaller==6.22.3')
Invoke-Checked $pythonPath @('-m','pip','install','--no-deps',(Join-Path $projectRoot 'vendor\maia3'))

# Keep Hugging Face quiet during the build. The packaged engine uses the
# checkpoint shipped with this project and never needs a model download.
$env:HF_HUB_DISABLE_TELEMETRY = '1'

if (Test-Path $distPath) { Remove-Item -LiteralPath $distPath -Recurse -Force }
New-Item -ItemType Directory -Force -Path $distPath,$workPath | Out-Null
Invoke-Checked $pythonPath @('-m','PyInstaller','--noconfirm','--clean','--onedir','--console',
  '--name','maia3-uci','--distpath',$distPath,'--workpath',$workPath,'--specpath',$workPath,
  '--collect-data','maia3','--hidden-import','maia3.uci',$entryPath)

$builtEngine = Join-Path $distPath 'maia3-uci\maia3-uci.exe'
if (-not (Test-Path $builtEngine)) { throw 'PyInstaller did not produce the Maia engine executable.' }
Write-Host "Bundled Maia engine created at $builtEngine"
