param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
Set-Location $repoRoot

Write-Step "Verificando Node.js"
node --version | Out-Host
npm --version | Out-Host

Write-Step "Instalando dependencias npm"
if ($SkipBuild) {
  npm install --ignore-scripts
} else {
  npm install
}

Write-Step "Instalando Chromium do Playwright"
npx playwright install chromium

if (-not $SkipBuild) {
  Write-Step "Compilando TypeScript final"
  npm run build
}

Write-Step "Dependencias instaladas"
