# Auto-Mode Checklist — Preencha Antes de Iniciar Long-Run

**Tempo de preenchimento:** ~5 minutos.

**Propósito:** Responder estas 8 perguntas força você a ser explícito sobre escopo, riscos e expectativas. As respostas vão para `~/.claude/longrun-memory.md` e `settings.json`.

Siga a ordem. Nenhuma resposta pode ser vaga ("melhorar código") — precisa ser testável.

---

## 1. Qual é o Escopo Exato?

**Pergunta:** Qual é a tarefa em uma sentença? Quais arquivos/módulos mudam? Quais NÃO mudam?

**Exemplos de BOM:**
- "Refatorar `app/Controllers/AuthController.php` para remover dependência global de `$user`. Apenas editar este controller e seus testes em `tests/Unit/AuthControllerTest.php`. Não tocar em middleware, models ou outras controllers."
- "Implementar filas de re-tentativa em `src/queue/RetryQueue.ts`. Apenas arquivo novo; não editar sistema de fila existente."

**Exemplos de RUIM (vago):**
- "Melhorar a qualidade do código"
- "Refatorar o projeto"
- "Implementar segurança"

**Sua resposta:**
```
[PREENCHA AQUI]
```

---

## 2. Qual é o Critério de "Pronto"?

**Pergunta:** Como você sabe que a tarefa terminou? Precisa ser **testável e verificável**.

**Exemplos de BOM:**
- "Testes passam (`npm test`), cobertura >= 90% (`npm run coverage`), `eslint` sem erros, e code review do Crivo aprova"
- "Migrations rodam sem erros (`php artisan migrate`), rollback funciona, testes de DB passam"
- "Endpoint retorna 2xx, validação de entrada funciona, documentação em OpenAPI atualizada"

**Exemplos de RUIM (subjetivo):**
- "Código limpo"
- "Funciona bem"
- "Sem bugs óbvios"

**Sua resposta:**
```
[PREENCHA AQUI]
```

---

## 3. Qual é seu Budget de Tokens?

**Pergunta:** Quantos tokens você está disposto a gastar nesta tarefa, **por sessão de 5h**?

**Referência:**
- Padrão Pro/Max: ~500k tokens por sessão (5h window)
- Máximo Opus 4.8: ~2M por sessão
- Cada sessão de 5h é independente; reset automático a cada 5h

**Exemplos:**
- Budget 500k = parar aos ~450k (90%)
- Budget 1M = parar aos ~900k (90%)

**[IMPORTANTE] Você NÃO pode exceder esse budget por sessão. Se tarefa gasta mais, vai precisar de múltiplos ciclos.**

**Sua resposta:**
```
Budget: _________ tokens por sessão (recomendado: 500000)
```

---

## 4. Qual é o Threshold de Parada?

**Pergunta:** Em qual % de quota você quer que o sistema **force a parada** automaticamente?

**Padrão recomendado:** 90%

**Razão:** Se continuar a 100%, bate o rate limit (429) e sessão encerra com erro. Parar aos 90% dá margem de segurança.

**Cálculo:** Se budget = 500k e threshold = 90%, parar aos 450k tokens consumidos.

**Sua resposta:**
```
Threshold: _____% (recomendado: 90)
```

---

## 5. Com Que Cadência Monitorar Uso?

**Pergunta:** A cada quantos minutos o sistema deve checar se passou de 90%?

**Opções:**
- **30 min:** Standard. Simples, menos overhead.
- **15 min:** Se tarefa consome rápido ou você quer precisão alta.
- **5 min:** Se tarefa é muito intensiva ou você quer controle fino.

**Como funciona:** `watch-usage.sh` é chamado via cron ou loop externo; lê status do Claude e decide.

**Sua resposta:**
```
Cadência: a cada _____ minutos (recomendado: 30)
```

---

## 6. Se Houver Ambiguidade, Fazer o Quê?

**Pergunta:** Se surgir uma dúvida sem resposta clara (código vago, padrão indefinido, requisito conflitante), qual deve ser o comportamento?

**Opções:**
- **"Parar e alertar"** — Claude para, marca checkpoint, aguarda retomada manual com mais contexto
- **"Tentar inferir, continue"** — Claude toma a melhor decisão possível e segue
- **"Escalate para Crivo"** — Claude para, salva estado, faz prompt a um subagente de revisão (Crivo)
- **"Perguntar (requer intervenção)"** — Claude para e espera resposta (inutilizável em modo 100% autônomo)

**Recomendação para 12h autônomo:** "Parar e alertar" (mais seguro) ou "Tentar inferir" (mais agressivo).

**Sua resposta:**
```
Comportamento em ambiguidade: _________________ (recomendado: "parar e alertar")
```

---

## 7. Denylist Customizada?

**Pergunta:** Além da denylist padrão (git push, rm -rf, npm publish, DROP), há algo que você quer **bloquear especificamente** nesta tarefa?

**Denylist padrão (já em vigor):**
```
Bash(rm -rf *)
Bash(rm -r *)
Bash(git push --force *)
Bash(git push origin main *)
Bash(git push origin master *)
Bash(kubectl delete *)
Bash(kubectl apply *)
Bash(DROP TABLE *)
Bash(DROP DATABASE *)
Bash(npm publish *)
Bash(yarn publish *)
```

**Customizações comuns:**
- `Bash(docker push *)` — se não quer push de imagens
- `Bash(psql * -c *)` — se quer restringir SQL direto
- `Bash(terraform apply *)` — se quer evitar deploy IaC
- `Bash(npm install -g *)` — se quer evitar instalação global

**Sua resposta:**
```
Itens adicionais a bloquear:
- ____________________________________
- ____________________________________
- ____________________________________
(deixe em branco se só quer denylist padrão)
```

---

## 8. Condição de Parada Além de 90%?

**Pergunta:** Há alguma condição **além de atingir 90% de quota** que deve parar a sessão?

**Exemplos:**
- "Se tarefa terminar, parar (nem esperar 90%)"
- "Se encontrar erro X, parar e alertar"
- "Se falhar 3 testes seguidos, parar"
- "Nenhuma — parar só em 90%"

**Sua resposta:**
```
Condição de parada adicional:
[PREENCHA AQUI ou "Nenhuma"]
```

---

## Resumo: Copie as Respostas para `~/.claude/longrun-memory.md`

Após preencher as 8 perguntas acima, copie as respostas para a seção "Decisões de Auto-Mode" em `~/.claude/longrun-memory.md` (use o template em `long-run/longrun-memory.template.md`).

**Checklist de Validação Final:**

- [ ] Escopo é específico (não vago como "melhorar")
- [ ] Critério de pronto é testável (ex: "testes passam")
- [ ] Budget é realista para a tarefa
- [ ] Threshold é 90% (padrão, seguro)
- [ ] Cadência faz sentido (30min = standard)
- [ ] Comportamento em ambiguidade escolhido
- [ ] Denylist definida (padrão ou customizada)
- [ ] Condição de parada é clara
- [ ] Respostas estão em `~/.claude/longrun-memory.md`

✓ **Tudo OK?** Avance para:

1. Criar `~/.claude/longrun-memory.md` (a partir do template)
2. Configurar hooks em `~/.claude/settings.json` (bloco de `settings.hooks.example.json`)
3. Copiar scripts para `~/.claude/hooks/long-run/`
4. Iniciar long-run conforme instruções em `docs/08-long-run-autonomo.md`

---

## Dúvidas?

- **Sobre escopo?** Leia "Parte A" em `docs/08-long-run-autonomo.md`
- **Sobre tokens e budget?** Leia "Parte B" em `docs/08-long-run-autonomo.md`
- **Sobre riscos?** Leia "Parte F" em `docs/08-long-run-autonomo.md`
