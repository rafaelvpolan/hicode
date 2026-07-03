---
name: pre-push
description: "Gate de qualidade antes do git push (codefox). Sem argumentos: faz a pré-revisão do que está saindo — roda as tools do .codefox.yaml (lint, typecheck, testes, build) que estejam devidamente configuradas no projeto e revisa o diff com os agentes do kit — e reprova o push se houver falha de qualidade ou violação dos padrões; segurança vira resumo não bloqueante. Com --install: instala o hook git pre-push (sh puro, Linux/macOS/Windows, estilo husky sem depender de husky) que chama este skill automaticamente a cada push. Use quando o usuário pedir pré-push, pre-push, gate de push, pré-revisão antes de subir, ou instalar o hook de push."
user-invocable: true
argument-hint: "[--install]"
---

# /pre-push — Gate de qualidade antes do push (codefox)

Você agora opera como **Codefox Pre-Push**, o gate local de qualidade que roda antes de cada `git push`.

Argumentos recebidos: $ARGUMENTS

- **Sem argumento** → modo **EXECUTAR** (roda o gate agora).
- **`--install`** → modo **INSTALAR** (instala o hook git neste repositório).
- Qualquer outro argumento: ignore e siga como EXECUTAR.

Detecte também o **modo hook**: se a variável de ambiente `CODEFOX_HOOK=1` estiver presente, você foi chamado pelo hook de push (headless). Nesse modo **não faça perguntas** — decida sozinho, seja rápido e escreva o veredito no final.

## Princípios

1. **Só bloqueia por qualidade.** Reprovam o push: (a) falha de tool de qualidade **devidamente configurada** no projeto (lint, typecheck, teste, build, format...); (b) violação objetiva e de alta confiança dos padrões do time (CLAUDE.md do projeto, política de comentários do kit) ou defeito evidente no diff (código quebrado, resto de debug). Em dúvida → **não bloqueia**, vira aviso.
2. **Segurança nunca bloqueia.** Achados de segurança (tools de `security`/`secrets`/`audit` e da revisão) entram num **resumo não bloqueante** ao final — visíveis, mas o push passa.
3. **"Devidamente configurada" é pré-condição.** Antes de tratar uma falha como bloqueante, confirme que a tool existe de verdade no projeto: binário/script disponível, arquivo de config presente. Tool não configurada → **SKIP** (listada no relatório, nunca bloqueia). Falha de **ambiente** — toolchain/infra ausente na máquina (node/pnpm não instalados, daemon parado, sem credencial, sem rede) — não bloqueia, vire nota. **Cuidado com a distinção:** "module not found" de uma dependência que **deveria estar no manifesto do projeto** (import de pacote não declarado) é defeito de **código**, não de ambiente → **bloqueia**.
4. **Read-only.** Nunca rode comandos com `--fix`/`--write` e nunca edite código do usuário durante o gate. Isso vale também para os **subagentes**: todo prompt de delegação deve dizer explicitamente "REVISÃO SOMENTE — não modifique nenhum arquivo; não use Write/Edit".
5. **O escopo é o que sai no push** — commits locais que o remoto ainda não tem. Mudanças não commitadas não fazem parte do push; se o working tree estiver sujo, avise que as tools rodam sobre o working tree (podendo divergir do que sobe).

## Resolução da configuração (.codefox.yaml)

1. **Projeto:** `<raiz do repo>/.codefox.yaml` — se existir, use **somente** ele (ignora o global).
2. **Global:** `~/.claude/.codefox.yaml` — fallback quando o projeto não tem o seu. É multi-documento: o **primeiro doc (BASE, sem `stack:`)** carrega a configuração de revisão de PR e seções compartilhadas de outras skills — **ignore-o no gate**; os demais docs (um por stack, com `stack.detect`) trazem as `tools`. Cada doc de stack traz um campo `stack.detect` com os globs que o ativam — selecione **apenas** os docs cujo `detect` casa com arquivos do repo e considere a **união** deles. Na família Node, os seletores desambiguam: `turbo.json` → Monorepo; `next.config.*` → React/Next; `nest-cli.json` → NestJS; se mais de um casar, prefira o mais específico (Turborepo > Next > NestJS) para as tools de nome repetido. Doc sem `stack.detect` (arquivo antigo/editado): caia para heurística por manifest (`composer.json` → PHP; `pyproject.toml` → Python; `go.mod` → Go; `Cargo.toml` → Rust; `build.gradle*` → Java; `*.tf` → Terraform; `Dockerfile`/`.github/workflows` → transversal). Nome repetido entre docs selecionados → trate como tools distintas qualificadas pela stack.
3. **Nenhum dos dois:** siga sem tools (relate isso) — a pré-revisão de padrões ainda acontece e ainda pode reprovar.

Deste formato, use **apenas** a seção `tools`. Ignore silenciosamente qualquer outra seção que o arquivo venha a ter (o formato codefox é compartilhado com outros skills).

### Schema de `tools`

```yaml
tools:
  lint: "pnpm lint"                # forma curta -> roda em todo gate
  test:                            # forma longa
    command: "pnpm test"           # obrigatório
    paths: ["src/**", "test/**"]   # opcional — roda só se o diff tocar algum glob
    working_dir: "apps/api"        # opcional — monorepo/subprojeto
    timeout_seconds: 600           # opcional — default 300
    blocking: false                # opcional — força informativa (ou true: força bloqueante)
```

- Sem `paths` → roda sempre. Globs estilo gitignore (`**` = qualquer profundidade), **relativos à raiz do repo** (mesmo com `working_dir`).
- **Classificação:** `blocking` explícito sempre vence. Sem ele, o default: tool cujo **nome ou comando** indica segurança (`security`, `secrets`, `audit`, `sast`, `vuln`, `leak`, e scanners conhecidos como `gitleaks`, `semgrep`, `snyk`, `trufflehog`, `trivy`, `checkov`, `pip-audit`, `govulncheck`, `cargo audit`) é **informativa** (nunca bloqueia — resumo de segurança). Todas as outras são **bloqueantes**. Na dúvida, julgue pelo que o comando faz.
- **Atenção:** os comandos do `.codefox.yaml` executam localmente na máquina de quem dá o push. Se o diff que está saindo **altera o `.codefox.yaml`** (ou hooks do repo), destaque isso no relatório — mudança nesse arquivo é sensível.

## Protocolo — modo EXECUTAR

### 1. ESCOPO — o que está saindo

1. Se `CODEFOX_PUSH_RANGE` existir (modo hook): lista separada por vírgula. Entrada `A..B` → range direto. Entrada com **sha único** (branch novo no remoto) → base = merge-base com o branch default do remoto (`origin/HEAD`, senão `origin/main`/`origin/master`); sem base viável, limite aos últimos 50 commits e diga isso.
2. Sem a env (modo manual): `@{upstream}..HEAD`; sem upstream, merge-base com o branch default → `HEAD`.
3. `git diff --name-only <range>` + `git diff <range>` = arquivos e conteúdo sob análise. **Range vazio → PASS imediato** (nada a revisar).

### 2. TOOLS — verificações determinísticas

Para cada tool da config:
1. **Gatilho:** com `paths`, rode só se algum arquivo do diff casar com os globs; sem `paths`, rode sempre.
2. **Aplicabilidade:** binário/script existe? config presente? (ex.: `pnpm lint` exige script `lint` no `package.json`). Não aplicável → **SKIP** com motivo.
3. **Execução:** no `working_dir` (ou raiz), com timeout (`timeout_seconds` ou 300s). Tools independentes podem rodar em paralelo (Bash em background) quando não disputarem os mesmos artefatos; senão, sequencial. Capture exit code e cauda do output.
4. **Resultado:** exit 0 → PASS. Exit ≠ 0 → leia o output e julgue: falha de qualidade → **FAIL (bloqueia)** se a tool é bloqueante, ou entra no resumo de segurança se informativa; falha de ambiente → **NOTA** (não bloqueia).

### 3. PRÉ-REVISÃO — agentes sobre o diff

Revise o diff que sai contra os padrões do time (CLAUDE.md do projeto, política de comentários do kit, boas práticas da stack). Use os agentes do catálogo como o Nexus faz:

- **Diff pequeno** (≤ ~200 linhas): revise você mesmo no loop principal.
- **Diff maior ou multi-domínio:** delegue em paralelo via Agent tool — **limpio** (qualidade/padrões — a parte que pode bloquear) e **escudo** (segurança — sempre não bloqueante; em modo hook, instrua-o a análise local, sem web). Se o diff tocar migrations/schema, some **radix**; frontend pesado, **vitro**. Em modo hook, no máximo 2 agentes — velocidade importa. Em modo manual com diff muito grande, pode orquestrar via Workflow.
- **Todo prompt de delegação** inclui: "REVISÃO SOMENTE — não modifique nenhum arquivo; não use Write/Edit; devolva achados com arquivo:linha e evidência". Se a delegação a subagentes não estiver disponível no ambiente, revise você mesmo inline — nunca falhe o gate por não conseguir delegar.

**Barra para bloquear por revisão** (todas exigem alta confiança e evidência citável no diff): violação de padrão documentado do projeto/kit; defeito evidente (referência inexistente, lógica claramente quebrada); resto de debug (`console.log`/`dd()`/`var_dump` de depuração, código morto comentado). Todo o resto — sugestões, estilo, performance, dúvidas — são **avisos não bloqueantes**.

### 4. VEREDITO + RELATÓRIO

1. Compile: tabela das tools (PASS/FAIL/SKIP + motivo), achados bloqueantes da revisão (arquivo:linha + evidência), avisos, e o **resumo de segurança** (não bloqueante).
2. **Veredito:** FAIL se (e somente se) houver tool bloqueante que falhou por qualidade **ou** achado bloqueante da revisão. Caso contrário PASS — mesmo com achados de segurança.
3. **Grave o arquivo de veredito** (sempre, nos dois modos — última ação antes do relatório), via Bash. Se a env `CODEFOX_VERDICT` existir (modo hook), grave **nesse caminho exato**; senão compute:
   ```sh
   printf 'PASS\n' > "${CODEFOX_VERDICT:-$(git rev-parse --git-dir)/codefox-prepush.verdict}"   # ou FAIL
   ```
4. Encerre o relatório com a linha-sentinela exata: `CODEFOX PRE-PUSH: PASS` ou `CODEFOX PRE-PUSH: FAIL`.
5. Em modo manual com FAIL: aponte como corrigir cada item; mencione que `git push --no-verify` pula o gate (não recomendado). Em modo hook: relatório enxuto, sem perguntas.

## Protocolo — modo INSTALAR (--install)

1. Confirme que está num repo git (`git rev-parse --git-dir`); senão, explique e pare.
2. Descubra o diretório de hooks: `git rev-parse --git-path hooks` (cobre worktrees). **Se `git config core.hooksPath` estiver setado** (husky ou similar), avise que o repo já tem gerenciador de hooks e proponha integrar o bloco do gate ao `pre-push` existente desse gerenciador em vez de gravar em `.git/hooks` — confirme com o usuário antes.
3. Trate hook existente em `<hooks>/pre-push`:
   - Contém o marcador `codefox-pre-push` → é nosso; sobrescreva (atualização).
   - Existe e é de terceiros → mova para `<hooks>/pre-push.local` (preserve permissão de execução) e instale o nosso, que o encadeia automaticamente.
4. Grave o **Template do hook** via Bash heredoc e `chmod +x`. **⚠️ NUNCA copie o template do texto desta conversa:** a substituição de argumentos do harness corrompe placeholders shell (`$0`/`$1`/`$2`/`$@`) no texto renderizado quando o skill é invocado com argumento. **Leia o template do arquivo real em disco** — `~/.claude/skills/pre-push/SKILL.md`, bloco entre `<<'CODEFOX_EOF'` e a linha `CODEFOX_EOF` — com a tool Read, e grave a partir dele. **Atenção à indentação:** o arquivo final começa com `#!/bin/sh` na **coluna 0** e nenhuma linha tem indentação extra — em especial os delimitadores `CODEFOX_REFS`. **Validação obrigatória pós-gravação:** `sh -n <hook>` sai 0; `grep -F 'CODEFOX_REMOTE="$1"' <hook>` e `grep -F '"$@"' <hook>` encontram as linhas (se não, o template foi corrompido — regrave a partir do disco).
5. **Scaffold do `.codefox.yaml`** — se já existir na raiz, **não toque** (relate que o projeto já tem o seu). **Deleção pendente ≠ ausente:** se o arquivo não está no disco mas o `git status` mostra deleção não commitada dele, é decisão em andamento do usuário — em modo interativo pergunte (restaurar / gerar do zero / deixar sem); em headless **não gere**, relate e siga. Se genuinamente não existir, **gere-o automaticamente, adaptado ao projeto** (funciona também em modo headless — não requer perguntas):
   a. **Fonte das formas:** leia o modelo global `~/.claude/.codefox.yaml` — o doc **BASE** (revisão de PR + seções compartilhadas) e os docs de **stack** (`stack.detect` + tools). O arquivo do projeto sai **COMPLETO num único documento**: todas as seções do BASE adaptadas + a seção `tools` adaptada. Se o global não existir, use seu conhecimento do formato com o mesmo schema.
   a2. **Adapte as seções BASE ao projeto** — não copie placeholders às cegas:
      - `project.name` = nome do repo; `project.stack` = stacks/versões reais detectadas nos manifests; `project.architecture` e `project.critical_domain` = infira da estrutura/domínio **só quando evidente** (senão mantenha o placeholder `<...>`); `project.reference_docs` = docs que existem de verdade (README, `docs/*`, CONTRIBUTING, CLAUDE.md).
      - `path_filters`: mantenha os excludes do modelo + acrescente diretórios gerados reais do projeto.
      - `path_instructions`: reescreva cada `path:` para a **estrutura real** (ex.: `cashbarber-core/modules/**` em vez de `src/domain/**`), preservando o espírito das instruções; omita entradas sem equivalente no projeto.
      - Demais seções (`language`, `tone_instructions`, `review`, `precision`, `priorities`, `severity`, `global_rules`, `never_comment`, `pre_merge_checks`, `output`) copiam do modelo como default do time. `learnings:` começa como lista vazia `[]`.
      - Todo placeholder `<...>` que não deu para inferir permanece no arquivo e é **listado no relatório** para o humano preencher.
   b. **Escaneie o projeto:** raiz **e** subdiretórios (1º/2º nível; ignore `node_modules`, `vendor`, `dist`, `.git`). Localize manifests e configs: `package.json` (+ lockfile → decide pnpm/yarn/npm), `composer.json`/`artisan`, `pyproject.toml`/`requirements*.txt`, `go.mod`, `Cargo.toml`, `build.gradle*`, `*.tf`, `Dockerfile*`, `.github/workflows`. Cada diretório com manifest é um subprojeto — **monorepo gera múltiplos blocos de tools**.
   c. **Adapte cada tool à realidade do projeto** — nunca copie o template cru:
      - Comandos vêm dos **scripts reais** (`package.json` scripts `lint`/`typecheck`/`test`/`build`; `composer.json` require-dev com pint/phpstan; etc.), com o package manager do lockfile.
      - Subprojeto fora da raiz → `working_dir` no subdir e `paths` **prefixados com o subdir** (globs sempre relativos à raiz). Nomeie a tool com o contexto (`core_typecheck`, `backend_lint`).
      - Inclua o arquivo de config da própria tool nos `paths`.
      - **Só entra tool que passa no teste de aplicabilidade** (runner existe, script/config presente, dependências instaláveis). O que não se aplica fica de fora — liste no relatório o que foi omitido e por quê.
      - Wrapper quebrado no ambiente (ex.: pnpm 11 falhando em `verify-deps`/builds não aprovados) → prefira o binário direto (`./node_modules/.bin/...`).
      - Tools de segurança só se o runner existir (`gitleaks`, `composer audit`, `pnpm audit`...); mantenha a convenção de nome (`security`/`secrets`/...) para a classificação automática.
   d. **Valide antes de finalizar:** o YAML gerado parseia (Node/Python); todo `working_dir` existe; todo comando tem runner presente.
   e. **Grave na raiz SEM pedir aprovação** — invocar `--install` já é o consentimento para gerar a config, e a ação é reversível (arquivo novo, não versionado: apagar desfaz). Não pare para perguntar nem em modo interativo nem em headless; grave e então mostre no relatório o arquivo gerado com o racional por tool. Avise: o arquivo fica **não versionado** até ser commitado — commitá-lo é o que estende o gate ao time inteiro.
6. **Verifique e reporte:** hook presente e executável; onde foi instalado; se havia hook anterior encadeado; o `.codefox.yaml` gerado (conteúdo + racional) ou o motivo de não gerar; como testar (rodar `/pre-push` manual, ou fazer um push para um remote descartável — ex.: bare repo local; `git push --dry-run` também costuma exercitar o pre-push, mas não confie nele como única prova), como pular (`--no-verify` / `CODEFOX_SKIP=1`) e como desinstalar (`rm <hooks>/pre-push`, restaurando `pre-push.local` se houver).

### Template do hook (gravar exatamente assim, sem indentação)

```sh
cat > "<hooks>/pre-push" <<'CODEFOX_EOF'
#!/bin/sh
# codefox-pre-push v2 — gate do kit Prompter (instalado por /pre-push --install)
# Pular uma vez: CODEFOX_SKIP=1 git push   (ou git push --no-verify)

[ "$CODEFOX_SKIP" = "1" ] && exit 0

# o stdin do pre-push e single-consumer: capture UMA vez e reproduza
# para o hook encadeado e para o parsing abaixo
REFS="$(cat)"

HOOK_DIR="$(cd "$(git rev-parse --git-path hooks)" && pwd)"
if [ -x "$HOOK_DIR/pre-push.local" ]; then
  printf '%s\n' "$REFS" | "$HOOK_DIR/pre-push.local" "$@" || exit $?
fi

Z40="0000000000000000000000000000000000000000"
RANGES=""
while read -r lref lsha rref rsha; do
  [ -z "$lsha" ] && continue
  [ "$lsha" = "$Z40" ] && continue
  if [ "$rsha" = "$Z40" ] || ! git cat-file -e "$rsha" 2>/dev/null; then
    RANGES="$RANGES $lsha"
  else
    [ "$lsha" = "$rsha" ] && continue
    RANGES="$RANGES $rsha..$lsha"
  fi
done <<CODEFOX_REFS
$REFS
CODEFOX_REFS
RANGES="$(printf '%s' "$RANGES" | sed 's/^ *//')"
[ -z "$RANGES" ] && exit 0

if ! command -v claude >/dev/null 2>&1; then
  printf '%s\n' "[codefox] claude CLI nao encontrado — gate PULADO (fail-open)." >&2
  exit 0
fi

GIT_DIR="$(git rev-parse --git-dir)"
VERDICT="$GIT_DIR/codefox-prepush.verdict"
rm -f "$VERDICT"

printf '%s\n' \
  "[codefox] Gate de pre-push ativado — revisando o que vai subir (claude headless, ~1-3 min)." \
  "[codefox] O relatorio aparece no final. Pular uma vez: git push --no-verify  |  CODEFOX_SKIP=1 git push" >&2

( while :; do sleep 10; printf '.' >&2; done ) &
CODEFOX_TICK=$!
trap 'kill "$CODEFOX_TICK" 2>/dev/null' EXIT INT TERM

CODEFOX_HOOK=1 \
CODEFOX_VERDICT="$VERDICT" \
CODEFOX_PUSH_RANGE="$(printf '%s' "$RANGES" | tr ' ' ',')" \
CODEFOX_REMOTE="$1" CODEFOX_REMOTE_URL="$2" \
  claude -p "/pre-push" --permission-mode default \
    --model "${CODEFOX_MODEL:-sonnet}" \
    --allowedTools "Bash,Read,Grep,Glob,Agent,Task" ${CODEFOX_CLAUDE_ARGS:-}
STATUS=$?
kill "$CODEFOX_TICK" 2>/dev/null
printf '\n' >&2

if [ -f "$VERDICT" ] && [ "$(head -n 1 "$VERDICT" | tr -d '\r')" = "PASS" ]; then
  printf '%s\n' "[codefox] PRE-PUSH APROVADO — push liberado." >&2
  exit 0
fi
printf '%s\n' "" \
  "[codefox] PRE-PUSH REPROVADO (ou veredito ausente; claude exit=$STATUS). Push bloqueado." \
  "[codefox] Corrija os itens do relatorio acima e tente de novo." \
  "[codefox] Escape (nao recomendado): git push --no-verify" >&2
exit 1
CODEFOX_EOF
chmod +x "<hooks>/pre-push"
```

## Notas de plataforma e operação

- **Windows:** o Git for Windows executa hooks `sh` com o shell embutido — o script acima funciona sem PowerShell/husky. Garanta LF (o heredoc resolve).
- **Custo/tempo:** o modo hook roda um Claude headless na conta de quem dá o push. O modelo default do gate é **sonnet** (rápido e barato para um gate por push); sobrescreva com `CODEFOX_MODEL=opus` (ou outro) no ambiente. `CODEFOX_CLAUDE_ARGS` segue disponível para flags extras. Diff pequeno + tools com `paths` bem definidos = gate rápido; o relatório sempre diz o que rodou e por quê.
- **Fail-open consciente:** sem `claude` no PATH o hook deixa o push passar avisando; com `claude` presente, veredito ausente/ilegível **bloqueia** (fail-closed), com `--no-verify` como escape.
- **`--permission-mode default` é obrigatório na chamada do hook:** sem ele, o headless herda o `defaultMode` das settings do usuário — se for `plan`, o skill fica preso planejando, não grava veredito e todo push bloqueia indevidamente.
- Você mesmo escreve seguindo a política do kit: nada de comentário de prosa em código de aplicação que você venha a gerar (o hook `pre-push` é shell — isento).
