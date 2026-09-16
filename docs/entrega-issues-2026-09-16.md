# Entrega parcial das issues — 16/09/2026

Esta entrega **não conclui todas as issues**. Base `origin/main` em `d466f3d`.
A branch e o checkout originais foram preservados.

## hicode#24: configuração e envio confiável

- O pedido conserva duas chaves de intenção: criar sessão e enviar execução.
  Resultado incerto pode ser retomado com a mesma chave, inclusive após recarga
  da aba. Reconectar SSE não envia pedido. Duplo clique é bloqueado.
- Intenção pendente impede enviar conteúdo diferente com a mesma chave.
  Uma intenção nova, após confirmação, recebe chaves novas.
- Configuração negocia capacidade v1 com o HII. Motor antigo ou credencial sem
  permissão conserva o acompanhamento e mostra a limitação.
- Provedor/modelo são gravados pela API HII com ETag. Conflito 412 exige releitura
  e preserva a proposta no formulário para comparação; não sobrescreve sozinho.
- Opções sem capacidade declarada de edição/verificação ficam inelegíveis.
  O HII revalida no servidor, inclusive contra requisição manipulada.
- Preferência de provedor não é apresentada como garantia de localidade.
  Gateway concluído não é apresentado como gates/PR aprovados.

## Validação

- `bun run test`: tipagem, lint, **168 testes passaram, 1 pulado**, tipagem Vue/Nuxt.
- `bun run panel:build`: build de produção concluído.
- `HII_TEST_CHECKOUT=<worktree-hii> node scripts/test-hii-observabilidade.mjs`:
  desktop 1365px e mobile 390px passaram em autenticação, HTTP/SSE, hierarquia,
  métricas desconhecidas, XSS, ask readonly, configuração/ETag e conflito.
- Testes de intenção exercitam timeout após efeito remoto, resposta perdida de
  criação de sessão, duplo clique e isolamento por projeto.
- Testes usam servidor HII de fixture. Não comprovam inferência Ollama real.

## Pré-requisitos e reversão

Continuam as variáveis reais da integração: `HII_API_URL`, `HII_API_TOKEN`,
`HII_API_REPO`, `HICODE_PANEL_PASSWORD`, `HICODE_SESSION_SECRET`.
Token HII permanece exclusivamente no backend. Para a nova configuração é
necessária a extensão de capacidades da entrega irmã do HII e credencial
administrativa explicitamente autorizada pelo motor.

Intenções pendentes ficam em sessionStorage por projeto; fechar a aba pode
descartá-las. Antes de reenviar de outra aba, reconcilie o estado no motor.
Não há garantia de deduplicação entre navegadores diferentes.

Rollback do painel não cancela execuções nem muda preferências para remoto.
Dados de intenção pendente e preferências não devem ser apagados para ocultar
resultado incerto.

## Trabalho ainda pendente

| Issue | Situação |
| --- | --- |
| #19 | Descoberta guiada e síntese persistida/versionada não implementadas aqui. |
| #20 | Épicos, hierarquia e progresso por evidência não implementados aqui. |
| #21 | Editor técnico, limite de 500 linhas e fluxo revisão/despacho não implementados aqui. |
| #24 | Parcial: faltam política local resolvida, ciclo de ferramentas, recursos de inferência, pacote ampliado de revisão e piloto real, dependentes do HII #59. |

A recuperação persistente cobre envio de pedido/ask; ações de cancelar/retomar e
configuração não têm recuperação de intenção entre recargas nesta entrega.
Não fechar automaticamente nenhuma das quatro issues com este PR.
