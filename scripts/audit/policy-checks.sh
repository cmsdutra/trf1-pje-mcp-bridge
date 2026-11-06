#!/usr/bin/env bash
# Verificações de política específicas deste projeto (servidor MCP via stdio que
# manipula sessão autenticada do PJe). Sai com código 1 se houver violação.
set -uo pipefail
cd "$(dirname "$0")/../.."

fail=0
violation() { echo "::error::[$1] $2"; fail=1; }
ok() { echo "OK   [$1] $2"; }

# P1 — stdout é o canal MCP (stdio): qualquer escrita fora de src/cli corrompe o protocolo.
hits=$(grep -rnE "console\.(log|info|debug)|process\.stdout\.write" src --include=*.ts | grep -v '^src/cli/' || true)
if [ -n "$hits" ]; then violation P1 "escrita em stdout fora de src/cli (quebra o protocolo MCP):"$'\n'"$hits"; else ok P1 "nenhuma escrita em stdout no caminho do servidor"; fi

# P2 — execução dinâmica de código / processos.
hits=$(grep -rnE "\beval\(|new Function\(|child_process|\bexecSync\(|\bspawnSync\(" src --include=*.ts || true)
if [ -n "$hits" ]; then violation P2 "execução dinâmica/processos em src:"$'\n'"$hits"; else ok P2 "sem eval/child_process"; fi

# P3 — arquivos sensíveis versionados.
hits=$(git ls-files | grep -E '(^|/)(\.env|storage-state[^/]*\.json|.*\.(pem|key|p12|pfx)|downloads/.*|\.pje/.*)$' | grep -v '\.env\.example$' || true)
if [ -n "$hits" ]; then violation P3 "arquivos sensíveis no repositório:"$'\n'"$hits"; else ok P3 "nenhum segredo/sessão/download versionado"; fi

# P4 — hosts externos: só *.jus.br (e placeholders) são permitidos em src.
hosts=$(grep -rhoE "https?://[a-zA-Z0-9.-]+" src --include=*.ts | sed -E 's#https?://##' | sort -u | grep -vE '(^|\.)jus\.br$|^host$' || true)
if [ -n "$hosts" ]; then violation P4 "hosts fora de *.jus.br em src:"$'\n'"$hosts"; else ok P4 "somente hosts *.jus.br"; fi

# P5 — arquivos gravados com dados do usuário devem usar modo restrito (0o600/0o700).
hits=$(grep -rnE "writeFile\(" src --include=*.ts | grep -v "mode:" || true)
if [ -n "$hits" ]; then violation P5 "writeFile sem mode restrito:"$'\n'"$hits"; else ok P5 "writeFile sempre com mode"; fi

# P6 — storageState (cookies) salvo precisa de chmod 0600 explícito.
if grep -rn "storageState({" src --include=*.ts >/dev/null && ! grep -rnE "chmod\(.*0o600|chmod\(.*storageState" src --include=*.ts >/dev/null; then
  violation P6 "storageState é salvo sem chmod 0600 explícito (src/pje/auth.ts); o modo depende do umask"
else ok P6 "storageState protegido"; fi

# P7 — o redator de logs deve cobrir cookie/token/senha.
if grep -qE "cookie\|token\|authorization\|senha\|password" src/utils/logger.ts; then ok P7 "logger redige campos sensíveis"; else violation P7 "logger sem redação de campos sensíveis"; fi

# P8 — ferramentas MCP devem validar entrada com zod.
for f in src/tools/*.ts; do
  grep -q "z\.\|zod" "$f" || violation P8 "$f não usa zod para validar entrada"
done
[ $fail -eq 0 ] && ok P8 "ferramentas validam entrada"

exit $fail
