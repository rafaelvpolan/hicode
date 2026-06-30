# Long-Run Autônomo — Toolkit

Guia + scripts para rodar Claude Code por 12 horas desacompanhado, com auto-parada a 90% de quota.

---

## ⚠️ IMPORTANTE — Leia Antes de Começar

Este toolkit depende de **mecanismos não-oficiais** (endpoint OAuth, estrutura de credentials, tipo de hook statusline) que **não estão documentados publicamente pela Anthropic**. 

**Validações necessárias em sua máquina:**
1. **Formato de credentials**: Campo do token OAuth pode variar (`oauth_token` vs `claudeAiOauth.accessToken`)
2. **Endpoint OAuth**: Não-oficial, documentado por comunidade. Sem garantia de estabilidade.
3. **Arquivo `/tmp/claude_usage_current.json`**: Não criado automaticamente — precisa de script SessionStart para escrever

**Antes de confiar 12h numa tarefa, teste com sessão de 1–2h primeiro.** Verificar que:
- Arquivo de status é criado e atualizado
- Hook PreToolUse bloqueia tools em 90%
- Relauncher detecta reset e retoma

Se algo não funcionar como esperado, logs estão em `/tmp/*.log`. Leia antes de escalar.

---

## O Quê Tem Aqui

```
long-run/
├── README.md                           ← você está aqui
├── auto-mode-checklist.md              ← COMECE AQUI: 8 perguntas a responder
├── longrun-memory.template.md          ← template de memória de checkpoint
├── settings.hooks.example.json         ← bloco pronto para colar no ~/.claude/settings.json
│
└── Scripts (copie para ~/.claude/hooks/long-run/ ou ~/.claude/hooks/)
    ├── watch-usage.sh                  ← mede % (conta tokens dos transcripts) e GRAVA o status; rode via cron --write
    ├── check-usage-gate.sh             ← hook PreToolUse: lê o status e nega tools em 90%
    ├── write-status-from-oauth.sh      ← ALTERNATIVA [VERIFICAR] de fonte de % (endpoint OAuth não-oficial)
    ├── inject-longrun-memory.sh        ← hook SessionStart: injeta contexto
    └── relaunch-loop.sh                ← loop externo: detecta reset e relança sessão
```

> **Fonte do % (padrão):** `watch-usage.sh` conta os tokens das entradas dos transcripts
> (`~/.claude/projects/**/*.jsonl`) na janela de 5h e compara com um **budget que você calibra**
> — método verificável, sem depender de endpoint não-documentado. O `%` é uma **heurística**.
> `write-status-from-oauth.sh` é uma alternativa [VERIFICAR] (endpoint OAuth não-oficial).

## Fluxo Rápido

**⭐ COMECE AQUI:** Abra `SETUP-PASSO-A-PASSO.md` para um guia passo-a-passo com testes.

Resumo (após seguir o guia):
1. **Preencha** `auto-mode-checklist.md` (8 perguntas)
2. **Crie** `~/.claude/longrun-memory.md` a partir do template
3. **Cole** o bloco de `settings.hooks.example.json` em `~/.claude/settings.json`
4. **Copie** os 5 scripts (incluindo `write-status-from-oauth.sh`) para `~/.claude/hooks/long-run/`
5. **Teste** com sessão de 5min
6. **Inicie:**
   ```bash
   SESSION_ID=$(claude -p "$(cat ~/.claude/longrun-memory.md)" \
     --permission-mode acceptEdits --output-format json | jq -r '.session_id')
   echo "$SESSION_ID" > ~/.claude/longrun_session_current
   nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &
   ```

## Arquivos — Ordem Recomendada de Leitura

**Fluxo de setup:**
1. **`SETUP-PASSO-A-PASSO.md`** ← COMECE AQUI (guia prático de 10 passos com testes)
2. **`auto-mode-checklist.md`** — Preencha as 8 perguntas obrigatórias
3. **`longrun-memory.template.md`** — Template que você vai usar para checkpoint
4. **`settings.hooks.example.json`** — Bloco pronto para colar em `~/.claude/settings.json`
5. **Scripts** — Cópie para `~/.claude/hooks/long-run/`

**Referência (consulte conforme necessário):**
- **`README.md`** ← você está aqui (índice geral)
- **`docs/08-long-run-autonomo.md`** (em `../docs/`) — Guia conceitual completo

---

## Arquivos Detalhados

### auto-mode-checklist.md
8 perguntas que você **deve responder antes de começar**:
- Escopo exato?
- Critério de "pronto"?
- Budget de tokens?
- Threshold de parada?
- Cadência de monitoramento?
- Comportamento em ambiguidade?
- Denylist customizada?
- Condição de parada?

Respostas devem ir para `~/.claude/longrun-memory.md`.

### longrun-memory.template.md
Template de `~/.claude/longrun-memory.md`:
- Tarefa, escopo, critério de pronto
- Decisões de auto-mode (modo, denylist, cadência)
- Plano de alto nível (checkpoints)
- Progresso (atualizado a cada sessão)
- **Estado de pausa/retomada (crítico)** — próxima ação, arquivo/linha, contexto
- Denylist ativa

Esse arquivo é lido por hooks e pelo relauncher.

### settings.hooks.example.json
Bloco JSON de `permissions` + `hooks` pronto para colar em `~/.claude/settings.json`:
- **permissions:** allow/deny/ask + `defaultMode: acceptEdits`
- **hooks:** PreToolUse (gate de 90%), SessionStart (injeta memória)

Instruções no arquivo.

### Scripts

#### write-status-from-oauth.sh
**O quê:** **ALTERNATIVA [VERIFICAR]** ao `watch-usage.sh` como fonte do `%`. Escreve
`/tmp/claude_usage_current.json` a partir de um endpoint OAuth **não-oficial**. Use só se
preferir o número do servidor ao da heurística de transcripts — e só após validar na sua conta.  
**O que faz:**
- Lê o token OAuth de `~/.claude/.credentials.json` (`.oauth_token` // `.claudeAiOauth.accessToken`).
- Chama `https://api.anthropic.com/api/oauth/usage` **[VERIFICAR — endpoint não-documentado]**.
- **Normaliza** para o schema canônico `{used_percentage:N, source:"oauth", raw:...}`.

**[VERIFICAR]** Endpoint, header `User-Agent` e o caminho do `%` na resposta não são oficiais —
confirme com `curl` manual antes. Se não achar o `%`, o script **não** sobrescreve o status.
**Logs:** `/tmp/write-status-from-oauth.log`.

#### watch-usage.sh
**O quê:** Conta os tokens das entradas dos transcripts (`~/.claude/projects/**/*.jsonl`) na
janela de 5h e calcula o `%` contra um **budget calibrável**. Com `--write`, grava o status
canônico em `/tmp/claude_usage_current.json` — é o que o gate lê.
**Uso (cron, mantendo o status fresco — o "monitorar de X em X min"):**
```bash
# crontab -e
*/10 * * * * BUDGET=8000000 ~/.claude/hooks/long-run/watch-usage.sh --write
```
**Parâmetros:** `--budget N` (calibre p/ seu plano) · `--threshold P` (padrão 90) ·
`--window-hours H` (padrão 5) · `--write` (grava o status) · `--exit-on-threshold` (exit 2 se ≥) ·
`INCLUDE_CACHE_READ=1` (inclui cache_read na conta; padrão exclui, pois ele domina/é barato).

**Schema gravado (canônico):** `{"used_percentage":N,"tokens_used":N,"budget":N,"window_hours":5,"computed_at":"ISO"}`

**[HEURÍSTICA]** o limite real do plano não é exposto; o `%` é tokens-na-janela ÷ budget. Calibre
o budget observando alguns ciclos. Janela = móvel (últimas 5h); o reset real é definido pela
Anthropic e não é exposto.

#### check-usage-gate.sh
**O quê:** Hook PreToolUse que bloqueia tools quando uso >= 90%.  
**Quando roda:** Antes de CADA tool (Bash, Edit, Write, Read), disparado por múltiplos matchers em settings.json.  
**[CRÍTICO]** Agora há matchers para **todas as tools** (antes era só Bash).  
**O que faz:**
- Lê o payload do hook via **STDIN** (não de uma env var) — corrigido; ler `$HOOK_INPUT` sob `set -u` abortava o script e fazia o gate falhar aberto.
- Lê `/tmp/claude_usage_current.json` (chave `.used_percentage`; mantido fresco pelo cron do `watch-usage.sh --write`).
- Se `used_percentage >= 90%`, imprime JSON `hookSpecificOutput.permissionDecision: "deny"`.
- Se o arquivo não existe/está velho, assume 0% e **deixa passar** — isto é **FALHA ABERTO** (sem proteção). Loga WARN.
- Grava marcador de pausa em `~/.claude/longrun-memory.md`.

**Exit code:** 0 (o JSON de deny é o que bloqueia; não usar exit 2).

**[CRÍTICO — falha aberto]** A proteção de 90% só existe se `/tmp/claude_usage_current.json` estiver **fresco**. Garanta o cron do `watch-usage.sh --write` rodando. Sem ele, o gate assume 0% e nada é bloqueado.

#### inject-longrun-memory.sh
**O quê:** Hook SessionStart que injeta contexto da memória de longrun.  
**Quando roda:** No início/retomada de sessão.  
**O que faz:**
- Lê `~/.claude/longrun-memory.md`
- Escreve em stdout: `{ "hookSpecificOutput": { "additionalContext": "<conteúdo>" } }`
- Claude injeta como contexto automático

**Exit code:** 0.

#### relaunch-loop.sh
**O quê:** Loop externo (roda fora do Claude Code) que detecta reset e relança sessão.  
**Quando rodar:** Em background com `nohup ... &` ao iniciar long-run.  
**O que faz:**
1. Lê SESSION_ID de `~/.claude/longrun_session_current`
2. Chama endpoint OAuth a cada 5min para checar utilization
3. Quando utilization < 5% (quota zerou), aguarda ~30min e relança:
   ```bash
   claude -p "$(cat ~/.claude/longrun-memory.md)" \
     --resume "$SESSION_ID" --permission-mode acceptEdits
   ```
4. Atualiza SESSION_ID se novo (ex: se --resume expirou)

**Logs:** `/tmp/relauncher.log` (monitorar com `tail -f`).

**[VERIFICAR] CRÍTICO:**
- Campo do token OAuth em `~/.claude/.credentials.json`: pode ser `.oauth_token`, `.claudeAiOauth.accessToken`, ou outro. Validar com `jq 'keys' ~/.claude/.credentials.json` ANTES de usar
- Endpoint OAuth exato e campos de resposta: esperado `{five_hour: {utilization: N}}`, mas pode variar
- Header `User-Agent: claude-code/...` pode ser obrigatório ou opcional (não documentado)

Se relauncher falhar, verificar `/tmp/relauncher.log` para detalhes. Campos errados causam "OAuth token não encontrado" silenciosamente.

## Fluxo de Dados

```
CLI (claude -p ...)
  ↓
SessionStart hook (inject-longrun-memory.sh)
  ↓ injeta `~/.claude/longrun-memory.md`
  ↓
Claude roda (0–5h)
  ↓
watch-usage.sh monitorar (a cada 30min, ex: cron)
  ↓
PreToolUse hook (check-usage-gate.sh)
  ↓ se uso >= 90%, nega
  ↓
Claude para (atingiu 90% de quota)
  ↓ grava checkpoint em `~/.claude/longrun-memory.md`
  ↓
Sessão encerra
  ↓
[Fora do Claude Code: relauncher em background]
  ↓
relaunch-loop.sh detecta reset (utilization < 5%)
  ↓
Relança: `claude --resume $SESSION_ID`
  ↓
Repete ciclo

Status quo: ~12h de execução em 2–3 ciclos de 5h cada
```

## Troubleshooting

| Problema | Causa Provável | Solução |
|---|---|---|
| Script não encontra `/tmp/claude_usage_current.json` | O cron do `watch-usage.sh --write` não está rodando (ou o SessionStart não gravou o inicial) | Adicione ao crontab: `*/10 * * * * BUDGET=8000000 ~/.claude/hooks/long-run/watch-usage.sh --write` e confira `crontab -l` |
| PreToolUse bloqueia tudo, não só > 90% | `used_percentage` é null ou script não lê | Validar formato do JSON em `/tmp/claude_usage_current.json`; logar em `/tmp/check-usage-gate.log` |
| PreToolUse não bloqueia Edit/Write/Read após 90% | Matcher inadequado (só Bash) ou múltiplos matchers não configurados | **Usar múltiplos matchers** (Bash, Edit, Write, Read) como em `settings.hooks.example.json` v2 |
| Relauncher não retoma após reset | Campo de token errado OU endpoint retorna erro | Verificar `jq 'keys' ~/.claude/.credentials.json`; testar endpoint manualmente com curl |
| Relauncher trava com "token não encontrado" | Campo OAuth em `.credentials.json` não é `.oauth_token` | Executar `jq 'keys' ~/.claude/.credentials.json` e ajustar script com fallback de campos |
| Sessão nova em vez de `--resume` | SESSION_ID expirou (> 7 dias) | Longrun é para 12h–48h; se > 7 dias, criar sessão nova (perderá contexto) |
| Memória de longrun não é injetada | Hook `SessionStart` não está em settings.json | Colar bloco de `settings.hooks.example.json` (v2 com múltiplos matchers) |
| Modelo "esquece" escopo entre retomadas | Memória desatualizada | Atualizar `~/.claude/longrun-memory.md` ANTES de cada pausa; usar hook `Stop` (não implementado neste kit) |

## Perguntas Frequentes

**P: Posso rodar dois long-runs em paralelo?**  
R: Não recomendado. Cada um vai monitorar/pausar de forma independente. Se ambos chegarem a 90% na mesma janela, o relauncher vai competir. Use direto um após o outro.

**P: E se eu quiser parar antes de 12h?**  
R: Matar o processo Claude (Ctrl+C). Marcar "COMPLETO" na memória de longrun. Relauncher pode verificar e parar. Ou matar o relauncher com `pkill -f relaunch-loop.sh`.

**P: Qual é o custo real?**  
R: Depende da tarefa. Opus 4.8 em Max: ~$0.03 por 1M de input tokens, ~$0.15 por 1M de output. Sessão de 500k input + 50k output ≈ $30. Monitorar com `watch-usage.sh`.

**P: Posso usar isso com subagentes?**  
R: Sim. Subagentes herdam `--permission-mode acceptEdits` do pai. Assegurar denylist está em settings.json pai.

**P: E se a tarefa terminar mais cedo?**  
R: Relauncher continua rodando. Você pode matar com `pkill -f relaunch-loop.sh` ou deixar que expire naturalmente.

---

## Próximos Passos

1. Comece com `auto-mode-checklist.md`
2. Leia o guia completo em `/home/douglas/projetos/prompter/docs/08-long-run-autonomo.md`
3. Teste numa tarefa pequena (1h) antes de 12h
4. Monitor `/tmp/relauncher.log` durante execução
