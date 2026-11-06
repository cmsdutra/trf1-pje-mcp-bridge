#!/usr/bin/env bash
# Falha se alguma dependência de produção usar licença fora da lista permitida.
set -uo pipefail
cd "$(dirname "$0")/../.."
ALLOWED='^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|CC0-1\.0|Python-2\.0|MIT-0|Unlicense)$'
bad=$(node -e '
const lock=require("./package-lock.json");const re=new RegExp(process.argv[1]);
for(const [p,m] of Object.entries(lock.packages)){
  if(!p||m.dev||!m.license) continue;
  const ids=String(m.license).replace(/[()]/g,"").split(/ OR | AND /);
  if(!ids.some(i=>re.test(i))) console.log(p.replace(/^.*node_modules\//,"")+" -> "+m.license);
}' "$ALLOWED")
if [ -n "$bad" ]; then echo "Licenças fora da lista permitida:"; echo "$bad"; exit 1; fi
echo "Todas as licenças de produção são permitidas."
