#!/usr/bin/env bash
# Pipeline de auditoria local. Uso: scripts/audit.sh [--no-install]
# Gera audit-reports/ (JSON por etapa + summary.md). Código de saída 1 se alguma etapa bloqueante falhar.
# Variáveis: AUDIT_LEVEL=high|critical|moderate (padrão high) — severidade mínima que bloqueia o npm audit.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=audit-reports; rm -rf "$OUT"; mkdir -p "$OUT"
LEVEL="${AUDIT_LEVEL:-high}"
[ "${1:-}" = "--no-install" ] || PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts >"$OUT/install.log" 2>&1

declare -a ROWS; blocking=0
run() { # nome, bloqueante(1/0), comando...
  local name=$1 block=$2; shift 2
  if "$@" >"$OUT/$name.log" 2>&1; then ROWS+=("| $name | ✅ passou |")
  else ROWS+=("| $name | $([ "$block" = 1 ] && echo '❌ falhou' || echo '⚠️ avisos') |"); [ "$block" = 1 ] && blocking=1; fi
}

run typecheck 1 npx tsc -p tsconfig.json --noEmit
run lint 1 npm run lint
run tests 1 npx vitest run --reporter=json --outputFile="$OUT/tests.json"
run policy 1 bash scripts/audit/policy-checks.sh
run npm-audit-prod 1 npm audit --omit=dev --audit-level="$LEVEL"
run npm-audit-dev 0 npm audit --audit-level=high
run licenses 1 bash scripts/audit/licenses.sh
npm audit --json >"$OUT/npm-audit.json" 2>/dev/null
npm sbom --sbom-format cyclonedx --omit=dev >"$OUT/sbom.cdx.json" 2>/dev/null || true
if command -v gitleaks >/dev/null; then run secrets 1 gitleaks detect --no-banner --redact --report-path "$OUT/gitleaks.json"
else ROWS+=("| secrets | ⏭️ gitleaks não instalado (roda no CI) |"); fi

{ echo "# Relatório de auditoria — $(date -u +%FT%TZ)"; echo; echo "Commit: \`$(git rev-parse --short HEAD)\` · npm audit bloqueia em: \`$LEVEL\`"; echo
  echo "| Etapa | Resultado |"; echo "|---|---|"; printf '%s\n' "${ROWS[@]}"; } >"$OUT/summary.md"
cat "$OUT/summary.md"; echo; echo "Logs detalhados em $OUT/"
exit $blocking
