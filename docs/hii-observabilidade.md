# Motor ao vivo por HTTP

A rota `/motor` usa somente o contrato HTTP/SSE do HII. Ela não lê cards,
logs, PID, arquivos de preferência ou ANSI do motor. O layout legado não é
montado nessa rota. As outras páginas permanecem na integração anterior;
esta entrega não anuncia a migração total dessas páginas.

Implementação coordenada com [HII #54](https://github.com/rafaelvpolan/hii/issues/54).
Requer a extensão de observabilidade v1 anunciada em `/v1/capacidades`.

## Executar

Configure no backend, sem prefixo `NUXT_PUBLIC_`:

```bash
export HII_API_URL=http://127.0.0.1:8787
export HII_API_REPO=owner/projeto
# Forneça por seu gerenciador de segredos:
# HII_API_TOKEN: bearer do motor, ao menos 32 caracteres
# HICODE_PANEL_PASSWORD: credencial do operador, ao menos 12 caracteres
# HICODE_SESSION_SECRET: segredo de assinatura, ao menos 32 caracteres
bun install --frozen-lockfile
cd panel
bun install --frozen-lockfile
bun run dev
```

Abra `/motor`, entre com a credencial do painel e envie um pedido. Gateway é
o padrão; o orquestrador exige seleção explícita. Pergunta usa `/ask` readonly,
sem criar card executável. Uma nova sessão é criada apenas ao enviar o primeiro
pedido; é possível informar a sessão existente. Observar nunca cria trabalho.

O backend fixa o projeto autorizado e mantém o bearer fora do navegador.
Configure também `HII_API_REPOS=owner/projeto` na instância HII correspondente.
Não é um sistema multiusuário: a sessão autenticada representa um operador
desse projeto. Cookie assinado HttpOnly/SameSite Strict, oito horas; em produção
usa Secure e requer HTTPS. A autenticação cobre as novas rotas `/api/hii/*`;
as páginas antigas mantêm o modelo de implantação local que já possuíam.

Árvore de atividades, estado, tentativa, heartbeat separado do progresso,
origem, loops, motivos, métricas e canais vêm do motor. `null` não vira custo
zero. SSE reconstrói periodicamente, deduplica revisões e descarta a assinatura
ao fechar a conexão. Cliente lento é desconectado. Parar/retomar/responder/fecho
usam revisão esperada e idempotência do HII, sem repetir automaticamente POST.
Em resultado incerto, consulte o estado antes de criar uma nova intenção.

## Cliente de referência e atualização

`panel/server/hii/client.mjs` é o bundle do cliente público do HII, sem imports
do estado interno. O contrato espelhado está em `panel/shared/observabilidade.ts`.
Fonte desta entrega: HII commit
[`8addd1c486233a4abb9a92f1b857ab6b59fb24b9`](https://github.com/rafaelvpolan/hii/commit/8addd1c486233a4abb9a92f1b857ab6b59fb24b9).
Para atualizar a partir de um checkout revisado do HII:

```bash
bun build motor/api/cliente.ts --target=node --format=esm --outfile=/caminho/hicode/panel/server/hii/client.mjs
cp motor/observabilidade/contrato.ts /caminho/hicode/panel/shared/observabilidade.ts
```

Revise também a declaração `client.d.mts` e execute typecheck/testes do painel.
O conector não importa diretórios de runtime do motor e não inicia scheduler.
Para rollback da interface, retire o link `/motor`; o protocolo/estado do motor
continua independente. A atualização não faz deploy nem reinicia serviço ativo.
