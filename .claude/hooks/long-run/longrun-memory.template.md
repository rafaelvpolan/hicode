# Memória de Long-Run — TEMPLATE

**INSTRUÇÕES:** Copie este arquivo para `~/.claude/longrun-memory.md` e preencha todos os campos. Este arquivo é lido por hooks (`SessionStart`, `PreToolUse`) e pelo relauncher externo (ao resumir sessões).

Atualize ao fim de cada checkpoint ou sessão.

---

## Informações da Tarefa

### Descrição Breve
> [Qual é a tarefa em uma sentença? Ex: "Refatorar Controller X em Laravel para ser stateless"]

### Escopo Exato
> [O que muda? O que NÃO muda? Ex: "Apenas app/Controllers/AuthController.php e testes em tests/Unit/AuthControllerTest.php"]

### Critério de "Pronto" (Testável)
> [Como você sabe que terminou? Ex: "Testes passam, cobertura >= 90%, Crivo aprova"]

---

## Decisões de Auto-Mode (Do Checklist)

### Budget e Threshold
- **Budget por sessão:** 500000 tokens (ajuste se necessário)
- **Threshold de parada:** 90% (450000 tokens)
- **Razão:** Parar antes de atingir teto; evitar rate limit agressivo

### Monitoramento
- **Cadência de check:** a cada 30 minutos (1800 segundos)
- **Ferramenta:** `~/.claude/long-run/watch-usage.sh --budget 500000 --threshold 90`
- **Fonte de dados:** `/tmp/claude_usage_current.json` (DEVE ser escrito por um hook — ex: SessionStart que chama endpoint OAuth)
  - [VERIFICAR] Este arquivo **não é criado automaticamente**. Precisa implementar um script que escreva
  - Sugestão: hook `SessionStart` que chama `curl` para `https://api.anthropic.com/api/oauth/usage` e grava em `/tmp/claude_usage_current.json`

### Modo de Permissão
- **Modo CLI:** `--permission-mode acceptEdits`
- **Razão:** Auto-aprova edição/leitura no workdir, bloqueia `rm -rf`, git push, etc.
- **Denylist:** Padrão (veja abaixo)

### Comportamento em Ambiguidade
> [Se surgir dúvida sem resposta clara, o que fazer? Ex: "parar e alertar", "tentar inferir, continue", "escalate para Crivo"]

---

## Plano de Alto Nível (Checkpoints)

Estrutura de macrotarefas. Use como "índice" de progresso.

1. [ ] **Checkpoint A:** [Descrição]
   - Subtarefa A.1: [descrição]
   - Subtarefa A.2: [descrição]

2. [ ] **Checkpoint B:** [Descrição]
   - Subtarefa B.1: [descrição]
   - Subtarefa B.2: [descrição]

3. [ ] **Checkpoint C:** [Descrição]
   - Subtarefa C.1: [descrição]

---

## Progresso (Atualizar a Cada Sessão)

### Sessão 1 (t=0–5h)
- Horário início: [timestamp]
- Horário fim: [timestamp]
- Checkpoints completados:
  - [x] Checkpoint A (completo)
  - [~] Checkpoint B (parcial — até B.1)
  - [ ] Checkpoint C (não iniciado)
- Notas: [ex: "nenhuma", ou "entender código antigo levou mais tempo"]

### Sessão 2 (t=5–10h) — SE NECESSÁRIA
- Horário início: [timestamp]
- Horário fim: [timestamp]
- Checkpoints completados:
  - [x] Checkpoint B (completo)
  - [~] Checkpoint C (parcial)
- Notas: [...]

---

## Estado de Pausa/Retomada (CRÍTICO PARA CONTINUIDADE)

**ATUALIZAR ANTES DE CADA PAUSA** — isto é lido pelo relauncher ao resumir.

### Última Parada
- **Timestamp:** [YYYY-MM-DD HH:MM:SS UTC]
- **Razão:** [ex: "atingiu 90% de quota", "tarefa completada", "erro para manual review"]
- **Checkpoint alcançado:** [ex: "B.1"]

### Arquivo em Progresso
- **Caminho:** [ex: `app/Controllers/AuthController.php`]
- **Linhas:** [ex: `120–180`]
- **Método/função atual:** [ex: `authenticate()`]
- **O que foi feito:** [ex: "adicionado DI para $userRepository"]
- **O que falta neste arquivo:** [ex: "remover $this->user global, usar DI everywhere"]

### Próxima Ação (Retomada)
> [EXATO: o que fazer ao voltar? Ex: "Continuar refatoração de método `authenticate()` em linha 121; trocar `$this->auth` por `$auth` do DI"]

### Contexto Adicional (Se Relevante)
- **Decisões de código feitas:** [ex: "usar constructor injection em vez de property injection"]
- **Padrões estabelecidos:** [ex: "métodos privados não refatorar, apenas públicos"]
- **Armadilhas encontradas:** [ex: "evento `booted()` reinjeita o valor — rejeição não funciona sem editá-lo"]

---

## Denylist Ativa

Bloqueios que estão em vigor **neste** long-run. Copiado do settings.json.

```json
[
  "Bash(rm -rf *)",
  "Bash(git push --force *)",
  "Bash(git push origin main *)",
  "Bash(git push origin master *)",
  "Bash(kubectl *)",
  "Bash(npm publish *)",
  "Bash(DROP TABLE *)",
  "Bash(terraform destroy *)"
]
```

Customize conforme necessário para esta tarefa. Ex: adicionar `"Bash(docker push *)"` se relevante.

---

## Notas Operacionais

### Arquivos a Monitorar
- `/tmp/relauncher.log` — logs do loop externo de retomada
- `/tmp/check-usage-gate.log` — logs do gate de 90%
- `/tmp/inject-longrun-memory.log` — logs de injeção de contexto
- `/tmp/claude_longrun.log` — saída de claude commands (opcional)

### Session ID Atual
> [preenchido automaticamente pelo relauncher]
> SESSION_ID: [ex: `sess_2026062400001234567890ab`]

### Horário Esperado de Próxima Retomada
> [calc: se parou em 90% aos 4h50m, reset em ~1h → retoma ~5h50m depois do início]
> Retomada esperada: [YYYY-MM-DD HH:MM:SS UTC ± 30min]

---

## Exemplo Preenchido

```markdown
# Memória de Long-Run

## Informações da Tarefa

### Descrição Breve
Refatorar AuthController em Laravel para ser stateless (remover shared state).

### Escopo Exato
Apenas app/Controllers/AuthController.php + tests/Unit/AuthControllerTest.php.
Não tocar em middleware ou outras controllers.

### Critério de "Pronto"
- Todos os testes passam (`phpunit --filter AuthController`)
- Cobertura >= 90% (`phpunit --coverage`)
- Code review Crivo aprova

## Decisões de Auto-Mode

### Budget e Threshold
- Budget: 500000 tokens/sessão
- Threshold: 90% (450000)

### Monitoramento
- Cadência: 30min
- Ferramenta: watch-usage.sh
- Fonte: /tmp/claude_usage_current.json

### Modo
- acceptEdits (não bypass)

### Ambiguidade
Se padrão de código não é claro, parar e alertar.

## Plano de Alto Nível

1. [ ] Explorar estrutura AuthController
2. [ ] Identificar estado compartilhado
3. [ ] Refatorar métodos para DI
4. [ ] Testes novos para stateless
5. [ ] Cobertura para 90%
6. [ ] Code review Crivo

## Progresso

### Sessão 1 (t=0–5h)
- Início: 2026-06-24 09:00 UTC
- Fim: 2026-06-24 14:00 UTC
- Completados: Checkpoints 1–2, iniciado 3
- Notas: Entender padrão de cache levou 1h

## Estado de Pausa/Retomada

### Última Parada
- Timestamp: 2026-06-24 14:00:00 UTC
- Razão: 90% de quota (450k/500k)
- Checkpoint: 3 (refatoração em progresso)

### Arquivo em Progresso
- Caminho: app/Controllers/AuthController.php
- Linhas: 120–180 (método authenticate)
- Método: authenticate()
- Feito: adicionado $userRepository via DI em construtor
- Falta: remover $this->user global em linha 135–150

### Próxima Ação
Continuar refatoração do método authenticate() em linha 121.
Trocar `$this->auth->user()` por `$this->userRepository->getUser()` em todas ocorrências.
Depois: testes para o novo caminho.

### Contexto
- Decisão: constructor injection (não property)
- Padrão: public methods só, private não refatorar
- Armadilha: evento `booted()` reinjeta user — já foi ajustado

### Session ID
sess_2026062400abc123def456

### Próxima Retomada
Esperada em: 2026-06-24 19:30:00 UTC (±30min)
```

---

## Dicas para Preenchimento

1. **Seja específico.** "Próxima ação" não é "continuar"; é "refatorar `authenticate()` em linha 121, trocar `$this->auth` por injeção".

2. **Atualize antes de parar.** Cada checkpoint de pausa deve ter: arquivo, linhas, próxima ação.

3. **Use checkpoints para progresso.** Se tarefa tem 10 passos, defina 3–5 checkpoints de alto nível; não anote cada linha.

4. **Logs externo.** Se algo errado acontece, logs dos scripts (.log em /tmp) ajudam. Mencione qualquer anomalia na seção "Notas Operacionais".

5. **Reuse entre sessões.** Quanto mais preenchido, melhor o modelo consegue "acordar" no ponto certo.
