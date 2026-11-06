# Pipeline de auditoria

| Camada | O que verifica | Onde roda | Bloqueia? |
|---|---|---|---|
| Qualidade | `tsc --noEmit`, ESLint, Vitest | `audit.yml` / `scripts/audit.sh` | Sim |
| Políticas do projeto | `scripts/audit/policy-checks.sh` (P1–P8, abaixo) | idem | Sim |
| Dependências | `npm audit --omit=dev` (high+), licenças, SBOM CycloneDX | idem | Sim (prod) |
| Segredos | gitleaks no histórico completo | CI (local se instalado) | Sim |
| Revisão de PR | `dependency-review-action` (high+) | PRs | Sim |
| SAST | CodeQL `security-extended` | `codeql.yml` | Alertas no Security tab |
| Atualizações | Dependabot semanal (npm + actions) | `dependabot.yml` | PRs automáticos |

O workflow também roda toda segunda-feira, para detectar CVEs novos sem commits.

## Políticas do projeto

- **P1** nada escreve em stdout fora de `src/cli` (stdout é o canal MCP).
- **P2** sem `eval`, `new Function` ou `child_process`.
- **P3** nenhum `.env`, `storage-state*.json`, chave ou download versionado.
- **P4** apenas hosts `*.jus.br` no código.
- **P5** todo `writeFile` com `mode` restrito.
- **P6** `storageState` (cookies da sessão PJe) com `chmod 0600` explícito.
- **P7** logger redige cookie/token/senha.
- **P8** toda ferramenta MCP valida entrada com zod.

## Uso local

```bash
npm run audit:full                 # relatório em audit-reports/summary.md
AUDIT_LEVEL=critical npm run audit:full   # afrouxa o gate do npm audit
```

Para tornar o gate obrigatório, ative *branch protection* em `main` exigindo o check **Resultado da auditoria**.
