# Long-Run Autônomo — Setup Passo-a-Passo

Este guia é uma **checklist prática** para configurar o long-run de 12h desacompanhado. Siga exatamente nesta ordem.

---

## ANTES DE COMEÇAR

- [ ] Você tem acesso a `~/.claude/` e pode criar/editar arquivos
- [ ] Você tem `jq` instalado (necessário para todos os scripts)
- [ ] Você está em um projeto Git bem definido (não em `/` ou `~`)
- [ ] A tarefa tem escopo fechado (ex: "refatorar X", não "melhorar o projeto")

---

## PASSO 1: Validar Seu Ambiente

### 1.1 Verificar versão do Claude Code

```bash
claude --version
# Esperado: 2.1.187 ou mais recente
```

### 1.2 Verificar estrutura de credentials

```bash
jq 'keys' ~/.claude/.credentials.json
# Output esperado: ["oauth_token"] ou ["claudeAiOauth"] ou similar
# Anote qual campo contém o token OAuth
```

**[IMPORTANTE]** Se o output não aparecer ou mostra erro, contacte suporte. Sem token OAuth, o relauncher não funciona.

### 1.3 Testar endpoint OAuth (opcional, para debug)

```bash
TOKEN=$(jq -r '.oauth_token // .claudeAiOauth.accessToken // ""' ~/.claude/.credentials.json)
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  -H "User-Agent: claude-code/2.1.187" \
  "https://api.anthropic.com/api/oauth/usage" | jq .
# Esperado: {five_hour: {utilization: N, resets_at: ...}} ou similar
```

Se erro 401 ou 429, anote para depois. Continuaremos mesmo assim.

---

## PASSO 2: Responder o Checklist de Auto-Mode

- [ ] Abra `long-run/auto-mode-checklist.md`
- [ ] Responda as 8 perguntas (escopo, critério de pronto, budget, etc)
- [ ] Salve as respostas em um arquivo temporário (ou direto em `~/.claude/longrun-memory.md`)

**Exemplo de resposta para Pergunta 1:**
```
Escopo exato:
Refatorar app/Controllers/AuthController.php para remover dependency global de $user.
Apenas este controller e testes em tests/Unit/AuthControllerTest.php.
Não tocar em middleware, models ou router.
```

---

## PASSO 3: Criar a Memória de Long-Run

- [ ] Copie `long-run/longrun-memory.template.md` para `~/.claude/longrun-memory.md`

```bash
cp long-run/longrun-memory.template.md ~/.claude/longrun-memory.md
```

- [ ] Abra `~/.claude/longrun-memory.md` e preencha os campos:
  - Descrição breve da tarefa
  - Escopo exato (do checklist, Pergunta 1)
  - Critério de "pronto" (Pergunta 2)
  - Budget de tokens (Pergunta 3, padrão 500000)
  - Threshold (Pergunta 4, padrão 90%)
  - Cadência de check (Pergunta 5, padrão 30 minutos)
  - Plano de alto nível (checkpoints principais)

**Não preencha "Progresso" nem "Estado de Pausa/Retomada" — serão preenchidos durante a execução.**

---

## PASSO 4: Preparar os Scripts

### 4.1 Criar diretório de hooks

```bash
mkdir -p ~/.claude/hooks/long-run
chmod 755 ~/.claude/hooks/long-run
```

### 4.2 Copiar scripts

```bash
cp long-run/check-usage-gate.sh ~/.claude/hooks/long-run/
cp long-run/inject-longrun-memory.sh ~/.claude/hooks/long-run/
cp long-run/relaunch-loop.sh ~/.claude/hooks/long-run/
cp long-run/write-status-from-oauth.sh ~/.claude/hooks/long-run/
cp long-run/watch-usage.sh ~/.claude/hooks/long-run/
```

### 4.3 Dar permissão de execução

```bash
chmod +x ~/.claude/hooks/long-run/*.sh
```

### 4.4 Validar que estão acessíveis

```bash
ls -la ~/.claude/hooks/long-run/
# Esperado: 5 scripts com permissão +x
```

---

## PASSO 5: Configurar Hooks e Permissões

### 5.1 Abrir ou criar `~/.claude/settings.json`

```bash
# Se não existe:
touch ~/.claude/settings.json
echo '{}' > ~/.claude/settings.json

# Validar que é JSON válido:
jq . ~/.claude/settings.json
```

### 5.2 Mesclar o bloco de permissions + hooks

**IMPORTANTE: NÃO substitua o arquivo. Mescle manualmente.**

1. Abra `long-run/settings.hooks.example.json`
2. Copie o bloco `"permissions"` inteiro
3. Copie o bloco `"hooks"` inteiro
4. Abra `~/.claude/settings.json`
5. Adicione ou mesclue `permissions` e `hooks` (se já existem, mescle)

**Exemplo de resultado final:**
```json
{
  "permissions": {
    "allow": ["Read", "Bash(git *)", "Edit"],
    "deny": ["Bash(rm -rf *)", "Bash(git push --force *)", ...],
    "defaultMode": "acceptEdits"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{...}]
      },
      {
        "matcher": "Edit",
        "hooks": [{...}]
      },
      ...
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [{...}]
      }
    ]
  }
}
```

### 5.3 Validar JSON

```bash
jq . ~/.claude/settings.json
# Se erro, há um problema de sintaxe (falta vírgula, etc)
```

### 5.4 Configurar o cron que mantém o status fresco (ESSENCIAL)

O gate lê `/tmp/claude_usage_current.json`. Durante o run o uso **sobe**, então esse arquivo
precisa ser **reescrito de tempos em tempos** — este é o "monitorar de X em X min". Sem isso, o
gate lê um valor velho/0 e **falha aberto** (não protege). Adicione ao cron:

```bash
crontab -e
# Adicione (ajuste BUDGET ao seu plano — calibre observando alguns ciclos):
*/10 * * * * BUDGET=8000000 ~/.claude/hooks/long-run/watch-usage.sh --write
```

Confirme: `crontab -l` e, após ~1 min, `cat /tmp/claude_usage_current.json | jq .used_percentage`.

> Alternativa [VERIFICAR]: usar `write-status-from-oauth.sh` (endpoint OAuth não-oficial) no
> lugar do cron de transcripts. Só após validar o endpoint na sua conta.

---

## PASSO 6: Testar Hooks em Sessão Curta

Antes de rodar 12h, faça um teste de 5 minutos:

```bash
# Criar diretório de teste
mkdir -p /tmp/long-run-test
cd /tmp/long-run-test

# Sessão de teste (muito curta)
claude -p "Olá. Escreva um arquivo test.txt com 'hello world'" \
  --permission-mode acceptEdits \
  --output-format json | jq '.session_id' > /tmp/test-session-id.txt
```

### 6.1 Verificar que hooks rodaram

```bash
# Verificar log do gate
cat /tmp/check-usage-gate.log
# Esperado: entradas como "PreToolUse gate: tool=Bash cmd=..." e "ALLOWED"

# Verificar log de injeção de contexto
cat /tmp/inject-longrun-memory.log
# Esperado: "Contexto de longrun injetado"

# Verificar arquivo de status (schema canônico, escrito por watch-usage.sh --write)
cat /tmp/claude_usage_current.json | jq .
# Esperado: {"used_percentage": N, "tokens_used": N, "budget": N, "window_hours": 5, "computed_at": "..."}
```

### 6.2 Verificar que arquivo foi criado

```bash
ls -la /tmp/long-run-test/test.txt
# Esperado: arquivo existe e contém "hello world"
```

Se tudo OK, passe para o Passo 7.

Se falhas de hook:
- Verificar `/tmp/check-usage-gate.log` e `/tmp/inject-longrun-memory.log` para mensagens de erro
- Validar que scripts existem e têm +x
- Validar `~/.claude/settings.json` é JSON válido
- Re-ler Passo 5 e mesaclar novamente

---

## PASSO 7: Iniciar o Long-Run

### 7.1 Gravar SESSION_ID

```bash
# Iniciar a sessão
SESSION_ID=$(claude -p "$(cat ~/.claude/longrun-memory.md)" \
  --permission-mode acceptEdits \
  --output-format json | jq -r '.session_id')

echo "Session ID: $SESSION_ID"

# Salvar para o relauncher usar
echo "$SESSION_ID" > ~/.claude/longrun_session_current
```

### 7.2 Iniciar o relauncher em background

```bash
# Este script vai detectar quando a quota reset e relançar a sessão
nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &

# Confirmar que rodou
sleep 2
ps aux | grep relaunch-loop.sh
# Esperado: vê o processo rodando
```

### 7.3 Monitorar durante execução

Abra **3 terminais** em paralelo:

**Terminal 1 — Logs da sessão principal:**
```bash
tail -f ~/.claude/projects/*/*.jsonl | jq -c 'select(.message.usage) | .message.usage'
```

**Terminal 2 — Logs do relauncher e do gate:**
```bash
tail -f /tmp/relauncher.log /tmp/check-usage-gate.log
```

**Terminal 3 — Uso atual (o cron do 5.4 já atualiza o arquivo; aqui é leitura manual):**
```bash
BUDGET=8000000 ~/.claude/hooks/long-run/watch-usage.sh   # mesmo budget do cron
```

---

## PASSO 8: Quando Atingir 90%

Você verá em um dos terminais:
```
Status: THRESHOLD_EXCEEDED
Action: Stop tools immediately.
```

**O que fazer:**
- A sessão do Claude vai tentar rodar uma tool e será bloqueada
- O modelo vai reconhecer o bloqueio e fazer checkpoint
- **Atualize manualmente** `~/.claude/longrun-memory.md` com "Estado de Pausa/Retomada" se quiser maior precisão
- **Deixe o relauncher rodando** — ele vai detectar o reset (em ~5h) e relançar automaticamente

---

## PASSO 9: Retomada Automática

O relauncher `relaunch-loop.sh` vai:

1. Detectar que `utilization < 5%` (quota zerou)
2. Aguardar 30 minutos de segurança (para garantir reset)
3. Relançar: `claude -p "$(cat ~/.claude/longrun-memory.md)" --resume $SESSION_ID`
4. Claude reconstrói contexto a partir da memória
5. Continua de onde parou

**Você não precisa fazer nada.** Apenas deixar o relauncher rodando.

---

## PASSO 10: Parar Antes de 12h (Opcional)

Se a tarefa terminar mais cedo:

```bash
# Parar o relauncher
pkill -f relaunch-loop.sh

# Verificar logs finais
tail -50 /tmp/relauncher.log
```

Atualizar `~/.claude/longrun-memory.md` com status de "CONCLUÍDO".

---

## Troubleshooting

| Sintoma | Verificação |
|---|---|
| Gate nunca dispara / status velho ou ausente | O cron do Passo 5.4 está rodando? `crontab -l`. Rode `BUDGET=... watch-usage.sh --write` na mão e confira `cat /tmp/claude_usage_current.json`. Sem o arquivo fresco, o gate assume 0% e FALHA ABERTO. Log: `/tmp/check-usage-gate.log` |
| Relauncher não retoma | Verificar `/tmp/relauncher.log` — procurar "OAuth token não encontrado". Se achar, corrigir campo de token em `relaunch-loop.sh` baseado em `jq keys ~/.claude/.credentials.json` |
| Hooks não rodaram em teste | `jq . ~/.claude/settings.json` — JSON é válido? Se erro, há vírgula faltando. Re-ler Passo 5 e mesaclar de novo. |
| Scripts não encontrados | `ls -la ~/.claude/hooks/long-run/` — todos os 5 scripts existem? Se não, re-ler Passo 4. Permissões têm +x? |

---

## Checklist Final: Pronto para 12h?

- [ ] Validei que jq está instalado
- [ ] Validei token OAuth em `~/.claude/.credentials.json`
- [ ] Respondi as 8 perguntas do auto-mode-checklist.md
- [ ] Criei `~/.claude/longrun-memory.md` preenchido
- [ ] Copiei 5 scripts para `~/.claude/hooks/long-run/` e dei +x
- [ ] Mesacei `~/.claude/settings.json` com bloco de permissions + hooks
- [ ] Validei que `~/.claude/settings.json` é JSON válido (jq .)
- [ ] Rodei teste de 5min e verifiquei logs de hooks
- [ ] Iniciei a sessão principal e gravei SESSION_ID
- [ ] Iniciei relauncher em background
- [ ] Tenho 3 terminais monitorando (logs, relauncher, watch-usage)
- [ ] Confortável com 12h desacompanhado (li Parte F de docs/08-long-run-autonomo.md)

✓ **Tudo marcado?** Comece o long-run! Boa sorte.

---

## Links Úteis

- Guia completo: `/home/douglas/projetos/prompter/docs/08-long-run-autonomo.md`
- Toolkit: `/home/douglas/projetos/prompter/long-run/`
- Problemas conhecidos: `/home/douglas/projetos/prompter/long-run/README.md` (seção Troubleshooting)
