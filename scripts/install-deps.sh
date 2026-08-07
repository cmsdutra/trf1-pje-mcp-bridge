#!/usr/bin/env sh
set -eu

SKIP_BUILD=0
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

printf '%s\n' "==> Verificando Node.js"
node --version
npm --version

printf '%s\n' "==> Instalando dependencias npm"
if [ "$SKIP_BUILD" -eq 1 ]; then
  npm install --ignore-scripts
else
  npm install
fi

printf '%s\n' "==> Instalando Chromium do Playwright"
npx playwright install chromium

if [ "$SKIP_BUILD" -eq 0 ]; then
  printf '%s\n' "==> Compilando TypeScript final"
  npm run build
fi

printf '%s\n' "==> Dependencias instaladas"
