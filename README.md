# hicode

Painel de controle + repositório de estado para um sistema autônomo de engenharia de IA.

> **Você não prompta os agentes — você desenha o loop que os prompta.** Cada unidade de trabalho é um **card** em disco (a fonte de verdade); o **motor** (em `/home/rpolan/projects/podium/hii/`) executa o pipeline por card, mostra o preview do resultado, fecha o ciclo verde lendo exit codes reais do disco, e abre o PR. *O repo lembra; a conversa esquece.*

**Hicode é:**
- **Painel** (Vue 3 + Nuxt 4) — interface visual para cadastrar tarefas, aprovar previews, ler histórico
- **Estado** (`cards/`, `config/`) — fonte de verdade, compartilhada com o motor

**Motor está em:** `/home/rpolan/projects/podium/hii/` — execução, pipeline, gates, worktrees, CI, deploy

---

## Setup

```bash
bun install            # dependências do painel (raiz)
cd panel && bun dev    # inicia o painel em http://localhost:4318
```

O painel se conecta ao motor via CLI do hii. Confirme que o motor está rodando:

```bash
cd ../hii && bun run runner.ts --status
```

---

## Como usar

### Criar uma tarefa

1. Abra http://localhost:4318
2. Preencha o formulário: **projeto**, **prompt**, **depois** (instrução adicional, opcional)
3. Clique **Criar Card**

O card é criado em `cards/` e o motor começa a executar. Você acompanha em tempo real no painel.

### Aprovar um preview

1. Quando o motor diz que a tarefa está `PREVIEW`, o painel mostra um botão **Ver preview**
2. Clique para abrir o app; se estiver tudo certo, volte e clique **Aprovado**
3. Se precisar ajustar, clique **Recusar** e explique — o motor corrige

### Navegar histórico

- **Execuções**: abra o card → aba **Histórico** mostra todas as rodadas
- **Custos**: painel principal mostra custo acumulado por card e por dia
- **IA em uso**: **Configuração** mostra qual modelo roda cada papel (executor, reviewer, etc)

---

## Referência

| Arquivo | O quê |
|---|---|
| `CLAUDE.md` | autoridade de instrução do repo — roteamento Nexus, regras, contrato de ambiente |
| `plano/00..05` | arquitetura e decisões de design |
| `docs/adr/` | architectural decision records |
| `docs/kit/` | referência sobre o framework Nexus (agentes, prompting, etc) |

---

## Motor (hii)

Toda a execução ocorre no motor, um CLI autônomo que vive em `/home/rpolan/projects/podium/hii/`.

**O que o motor faz:**
- Lê `cards/` e `config/` (compartilhado com hicode)
- Cria worktrees a partir do repositório-alvo
- Roda pipeline de agentes (execute → preview → refine → tests → security → review → cleanup)
- Gate de code-review adversarial (Crivo)
- Abre PR no GitHub

**Comunicação:**
- Hicode fala com motor via CLI (`hii --once <card-id>`)
- Motor escreve resultados em `cards/runs/` (JSON com exit codes, tokens, tempo)
- Hicode lê de volta e mostra no painel

**Para saber mais:** `hii/README.md` + `docs/adr/0001-motor-separado.md`

---

## Segurança

- Painel escuta em loopback por padrão (`127.0.0.1:4318`) — sem autenticação, por design (operador único, máquina local)
- Endpoints mutantes rejeitam origem estrangeira (Origin guard)
- Motor roda em worktree isolado com `cwd-guard` (confina FS ao checkout do card)
- Banco read-only via role `SELECT`
- **24/7 desacompanhado:** requer sandbox (container + egress restrito) antes de produção

---

## Variáveis de ambiente

```bash
# Ambiente do painel
NUXT_HOST=127.0.0.1           # por padrão loopback
NUXT_PORT=4318

# Ambiente do motor
HII_HOME=/home/rpolan/projects/podium/hii
HICODE_CARDS_DIR=<este-repo>/cards
HICODE_REPOS_FILE=<este-repo>/config/repos.json
HICODE_IA_FILE=<este-repo>/config/ia.json
```

Ver `CLAUDE.md` para a lista completa.

---

## Roadmap

- ✅ **Separação Motor-Painel** (agosto/2026): motor em repo irmão (`hii`)
- 🔄 **HTTP + SSE** (próximo): painel fala com motor por REST em vez de CLI
- ⚠️ **Dashboard (Hidash)**: observação e métricas (próximo)

---

## Licença

Veja `LICENSE` na raiz.
