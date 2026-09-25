# Hicode

Hicode é a IDE de arquivos e gerenciamento de tarefas. O HII é o motor externo que executa o trabalho, mantém sessões com as IAs, aplica o plano de execução e registra resultados.

No Hicode você organiza projetos, consulta arquivos e evidências, prepara tarefas e planos, acompanha execuções e toma decisões. A execução pertence ao [HII](https://github.com/rafaelvpolan/hii).

## Iniciar o painel

Use Bun 1.4.0, como na CI:

```bash
bun install --frozen-lockfile
cd panel && bun install --frozen-lockfile
cd ..
bun run panel
```

Abra http://localhost:4318. O topo consulta a API do HII imediatamente e a cada cinco segundos, mostrando estado e versão. Quando o daemon está ligado, aparece a versão do processo em execução; quando está desligado, aparece a versão instalada na API. Uma API inacessível é exibida como indisponível, pois ausência de resposta não comprova que o daemon esteja desligado.

## Conectar ao HII

Configure no backend do Hicode:

```bash
export HII_API_URL=http://127.0.0.1:4321
export HII_API_TOKEN='seu-token-com-pelo-menos-32-caracteres'
export HII_API_REPO=owner/repo
export HICODE_PANEL_PASSWORD='sua-senha-do-painel'
export HICODE_SESSION_SECRET='seu-segredo-de-sessao-com-32-caracteres'
```

A API do HII e o daemon de execução são processos separados. Configure a API conforme [o guia de conexão](docs/hii-observabilidade.md), usando o mesmo token nos dois backends. O bearer não é enviado ao navegador. O endpoint autenticado GET /v1/motor/status informa estado, versão instalada, versão em execução e confirmação recente do daemon.

A página /motor usa HTTP/SSE e sessões autenticadas. As páginas legadas de cards ainda leem uma fila local: HICODE_CARDS_DIR deve apontar exatamente para a fila HII_CARDS_DIR usada pela API e pelo daemon. Usar os diretórios cards/ de dois clones diferentes não compartilha tarefas. Uma divergência bloqueia o início com erro visível. A ação de início só muda a tarefa quando a API do HII confirma a admissão, com controle de revisão e repetição idempotente.

### Partida automática opcional

Para iniciar o daemon ao solicitar trabalho nas páginas legadas, configure HICODE_MOTOR_AUTOSTART=1 no backend Hicode e HII_API_AUTOSTART=1 na API administrativa do HII. O endpoint POST /v1/motor/iniciar reutiliza o comando oficial de partida, serializa pedidos e aguarda confirmação de disponibilidade. Credenciais restritas por projeto não autorizam partida global.

A consulta de status ao abrir o painel não inicia processos. A partida exige um pedido de trabalho; não há reinício em loop nem retomada automática de cards pausados pelo usuário. Falha, timeout ou identidade desconhecida impedem o envio. O Hicode não troca de endpoint nem inicia um motor local como alternativa a uma API remota inacessível. Sem opt-in, inicie o daemon pelo procedimento operacional do HII.

## Testes

O guia completo para atualizar, iniciar e validar os dois projetos esta em [Testar a integracao Hicode + HII](docs/testar-integracao-hii.md).

```bash
bun run test
bun run panel:build
node scripts/test-motor-status.mjs
```

A suíte inclui filas divergentes, ausência de configuração, API inacessível, autenticação recusada, daemon desligado, estado desconhecido, preservação de tarefa pausada e contraste dos tokens. O teste de navegador verifica estado e versão na abertura, inclusive sem SSE, em desktop e largura de 390 px. Usa processos e cards de fixture; não executa IAs nem consome a fila do operador.

O teste completo da integração HTTP, planejamento e evidências usa um checkout candidato do HII:

```bash
HII_TEST_CHECKOUT=/caminho/para/hii node scripts/test-hii-observabilidade.mjs
```

## Referências

- [Conexão HTTP e limites da integração](docs/hii-observabilidade.md)
- [Separação entre painel e motor](docs/adr/0001-motor-separado.md)
- [Motor HII](https://github.com/rafaelvpolan/hii)

As páginas legadas seguem o modelo local com proteção de origem; /motor e /api/hii/* exigem sessão do operador. Mantenha o painel em loopback ou atrás da autenticação da sua infraestrutura.

### Recuperacao de tarefas

Cards parados oferecem diagnostico, vinculo persistente com o HII, snapshots de
configuracao e retomada confirmada pela API. Veja [o fluxo e seus limites](docs/recuperacao.md).
