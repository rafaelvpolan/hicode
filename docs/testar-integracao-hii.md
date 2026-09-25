# Testar a integração Hicode + HII

Este guia atualiza os dois projetos, conecta o Hicode à API do HII e valida painel, motor, eventos, retomada e execução local com Ollama.

## Pré-requisitos

- WSL com os repositórios em `~/projects/hii` e `~/projects/hicode`.
- Bun 1.4.0, Node.js 24, Git, `curl` e `jq`.
- Uma IA configurada para tarefas reais, verificável com `hii doctor`.
- Ollama e `qwen3:8b` somente para o piloto local opcional.

Os comandos usam uma credencial de desenvolvimento. Troque-a em ambientes compartilhados e nunca a envie ao navegador ou ao repositório.

## 1. Atualizar os projetos

```bash
cd ~/projects/hii
git status --short
git pull --ff-only
bun install --frozen-lockfile

cd ~/projects/hicode
git status --short
git pull --ff-only
bun install --frozen-lockfile
cd panel
bun install --frozen-lockfile
cd ..
```

Se o pull recusar alterações locais, preserve os cards e arquivos de operação. Não use `git reset --hard`.

## 2. Iniciar a API do HII

No primeiro terminal:

```bash
cd ~/projects/hii
export HII_API_TOKEN='hii-hicode-local-test-token-2026-abcdef'
export HII_API_HOST=127.0.0.1
export HII_API_PORT=4321
export HII_API_ADMIN=1
export HII_API_AUTOSTART=1
bun bin/hii.ts api
```

A API e o daemon são processos distintos. As flags administrativas permitem que um pedido autorizado inicie o daemon. Ao usar `HII_API_REPOS`, desative o autostart global e inicie o daemon manualmente.

## 3. Iniciar e acompanhar o motor

No segundo terminal:

```bash
cd ~/projects/hii
bun bin/hii.ts doctor
bun bin/hii.ts restart
bun bin/hii.ts status
```

Use `bun bin/hii.ts watch` para acompanhamento contínuo. Para depurar em foreground:

```bash
bun bin/hii.ts stop
bun bin/hii.ts run
```

Volte ao background com `bun bin/hii.ts start`.

## 4. Iniciar o painel Hicode

No terceiro terminal:

```bash
cd ~/projects/hicode
export HII_API_URL=http://127.0.0.1:4321
export HII_API_TOKEN='hii-hicode-local-test-token-2026-abcdef'
export HII_API_REPO='rafaelvpolan/hicode'
export HICODE_CARDS_DIR=/home/rpolan/projects/hii/cards
export HICODE_PANEL_PASSWORD='teste-local-hicode'
export HICODE_SESSION_SECRET='hicode-session-local-2026-abcdef123456'
export HICODE_MOTOR_AUTOSTART=1
bun run panel
```

Abra <http://localhost:4318>. Confirme estado e versão do motor, provedores, modelos, capacidades, identidade/carga/VRAM do Ollama, eventos HTTP/SSE e opções de configuração e retomada.

`HICODE_CARDS_DIR` deve apontar para a mesma fila usada pelo daemon HII.

## 5. Smoke test da API

```bash
export HII_API_TOKEN='hii-hicode-local-test-token-2026-abcdef'

curl --fail --silent --show-error \
  -H "Authorization: Bearer $HII_API_TOKEN" \
  http://127.0.0.1:4321/v1/motor/status | jq

curl --fail --silent --show-error \
  -H "Authorization: Bearer $HII_API_TOKEN" \
  http://127.0.0.1:4321/v1/provedores | jq
```

O primeiro retorno distingue API disponível, daemon ligado/desligado e versões. O segundo mostra capacidades e disponibilidade dos provedores.

## 6. Testar o autostart

Mantenha API e painel ativos e pare somente o daemon:

```bash
cd ~/projects/hii
bun bin/hii.ts stop
bun bin/hii.ts status
```

O Hicode deve mostrar o motor desligado. Solicite uma execução. A API deve iniciar o daemon, confirmar disponibilidade e somente então admitir a tarefa. Consultar status não inicia processos, e cards pausados não são retomados automaticamente.

## 7. Testar execução e retomada

1. Crie uma tarefa pequena no Hicode.
2. Confirme execução somente após admissão pelo HII.
3. Acompanhe o painel e `bun bin/hii.ts watch`.
4. Pare a tarefa durante uma etapa segura.
5. Recarregue e confira sessão, plano, configuração e evidências.
6. Use **Retomar** e confirme que apenas etapas pendentes executam.
7. Confirme que efeito incerto ou configuração ambígua bloqueia para escolha humana.

## 8. Executar as suítes

HII:

```bash
cd ~/projects/hii
bun run test
bun run test:tui:e2e
```

Hicode:

```bash
cd ~/projects/hicode
bun run test
bun run panel:build
bun run test:e2e:status
HII_TEST_CHECKOUT=/home/rpolan/projects/hii \
  node scripts/test-hii-observabilidade.mjs
```

As suítes usam fixtures e não devem consumir a fila operacional nem chamar uma IA paga.

## 9. Piloto real opcional com Ollama

```bash
cd ~/projects/hii
export HII_OLLAMA_PILOT=1
export HII_OLLAMA_AGENTIC=1
export HII_OLLAMA_LOCALITY_VERIFIED=1
export HII_OLLAMA_MODEL='qwen3:8b'
bun run pilot:ollama
```

Use somente modelo já instalado e autorizado. O piloto usa workspace temporário e não baixa modelos. Só ative a prova de localidade após verificar o deployment.

## Diagnóstico rápido

```bash
cd ~/projects/hii
bun bin/hii.ts doctor
bun bin/hii.ts status

curl --fail --silent --show-error \
  -H 'Authorization: Bearer hii-hicode-local-test-token-2026-abcdef' \
  http://127.0.0.1:4321/v1/motor/status | jq
```

Confira URL/porta, token, processo da API, fila compartilhada, doctor, terminal da API, `.runner.log` e eventos do card.

Para encerrar:

```bash
cd ~/projects/hii
bun bin/hii.ts stop
```

Finalize API e painel com `Ctrl+C`.
