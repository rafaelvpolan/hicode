# 0001 — Separação Motor-Painel em repositórios distintos

**Data:** 2026-08-20  
**Status:** Aceito  
**Autor:** Rafael Polan

## Contexto

O `hicode` começou como um repositório único acumulando três responsabilidades incompatíveis:

| Módulo | Linhas | Natureza | Ritmo | Público |
|---|---|---|---|---|
| Motor (`lib/runner/`, `lib/ai/`, `runner.ts`) | ~4.900 | Execução, pipeline, gates, worktrees, git, deploy | Contínuo | CLI + HTTP |
| TUI (`lib/core/`, `bin/repl.ts`, `bin/hii.ts`) | ~1.500 | Interface terminal para cadastrar e acompanhar tarefa | Conforme solicitado | Terminal |
| Painel (`panel/`) | ~3.850 | Interface web para mesmas tarefas | Exploratória | Navegador |
| Estado (`cards/`, `config/`, `lib/card/`) | ~1.200 | Persistência, contrato de repo | Estável | Disco |

**Pressão observada:**
- Mudanças de superfície TUI (quadro, confirmação, plano, resultado) consumiam mais tempo que melhorias de motor.
- Motor (roteamento, execução, contabilidade) estava preso a um repo que mudava por razões UI.
- TUI tinha conflito com o padrão visual: Painel em Nuxt era a verdadeira porta humana; TUI era legado.
- Testes de motor precisavam rodar isolados (headless), mas viviam sob a mesma raiz que código de terminal.

## Decisão

Separar em **três repositórios com responsabilidades claras:**

| Repo | O quê | Por quê |
|---|---|---|
| **hii** | Motor (execução, pipeline, gates, worktrees, git, CI, deploy) | Autoridade de execução; evolui independentemente; CLI puro, sem TUI. Versiona contrato (`@podium/hii-client`) |
| **hicode** | Painel (Vue 3 + Nuxt 4) + Estado (cards/, config/) | Autoridade de intenção; UI pura web; compartilha estado com motor via disco + CLI |
| **hidash** | Observação (painéis, métricas, eventos) | Autoridade de leitura; fase posterior |

**Não há:**
- Motor no hicode (vive em `hii/`)
- TUI no hicode (única interface humana: web Nuxt/Vue)
- HTTP/SSE no hii (hoje: CLI + disco; amanhã: REST + SSE)

## Alternativas consideradas

1. **Monorepo (turborepo/nx):** Manteria tudo no mesmo git, espelharia os problemas de mudanças cruzadas. Rejeitado: fronteiras duram melhor com repos físicos.

2. **Painel continua headless, motor roda 24/7 no mesmo tree:** Impede que painel e motor evoluam independentemente. Rejeitado: velocidade fica amarrada ao mais lento.

3. **Motor com HTTP desde o início:** Aumentaria complexidade (server, routing, error handling) enquanto CLI já funciona. Decidido: evoluir para HTTP quando painel falar REST (próxima fase), não antes.

4. **Compartilhar `lib/` via npm package:** Tentado em hicode v0. Cria acoplamento semver; qualquer mudança em `lib/card` ou `lib/contract` força publicação. Rejeitado: estado vive em disco, não em código importado.

## Consequências

### Positivas

- **Velocidade:** Motor evolui sem aguardar UI; painel muda sem derrubar pipeline.
- **Dependência clara:** Painel depende de `hii` (CLI); motor **não** depende de hicode.
- **Teste isolado:** Motor roda em headless; painel testa interação web. Sem conflito.
- **Versionamento:** hii publica `@podium/hii-client` (contrato tipado); hicode só consome.
- **Portabilidade:** Outro frontend (CLI, desktop Electron, etc) pode falar ao motor via mesmo `@podium/hii-client`.

### Neutras

- **Dois repos para clonar:** Hoje é mitigado por symlink de `node_modules` (hii e hicode compartilham). Amanhã: container resolve.
- **Sincronização de estado:** Painel e motor leem/escrevem em disco (`cards/`, `config/`); sem lock pessimista, collision é possível em uso paralelo (operador único, mitigado; scale exigiria queue/event-bus).

### Riscos & Mitigações

| Risco | Mitigação | Prioridade |
|---|---|---|
| `config/pipeline.json` fica desincronizado entre painel e motor (painel altera, motor tira cópia velha) | Painel altera via `MotorClient.dispatch()`, não direto em disco; motor lê de novo antes de cada card | Médio |
| Painel espera evento de motor que motor não publica | Contrato tipado em `@podium/hii-client` + testes no hii para toda mudança de formato | Médio |
| Futuro: trocar de CLI para HTTP quebra painel | `MotorClient` abstrai transporte; implementar `panel/server/motor/http.ts` sem tocar em consumidor | Baixo (design antecipa) |

## Gatilho para HTTP + SSE

Migrar do CLI para **REST** quando:

1. **`hii` publicar `@podium/hii-client` com tipos de `Target`, `Job`, `JobEvent`, `Policy`** — contrato tipado como interface pública.
2. **hii tiver `POST /v1/jobs` (criar job) e `GET /v1/jobs/:id/events` (stream SSE)** — endpoints REST.
3. **Painel implementar `panel/server/motor/http.ts`** — transporte HTTP com retry/backoff.
4. **Testes verificarem que `MotorClient` funciona com ambos transporte (CLI e HTTP)** — não é quebra de consumidor.

Até lá: **CLI funciona**; decisão de HTTP não fica bloqueada; painel não assume sobre motor além do contrato.

## Referências

- `hii/README.md` — Motor executável
- `hicode/README.md` — Painel + como rodar
- `hicode/CLAUDE.md` — Contrato de ambiente, roteamento Nexus
- `hii/lib/core/tipos.ts` — Tipos de Job, JobEvent (não versionado; em breve em `@podium/hii-client`)
