# Cards tecnicos revisados

A partir de um epico salvo em /planejamento, abra a tarefa em "Cards tecnicos".
Complete o documento JSON, salve um rascunho e aprove a revisao. O despacho e uma
acao separada e so fica disponivel quando o motor anuncia tecnico.versoes=[1].
O projeto precisa estar em HICODE_DISCOVERY_REPOS e ter contrato local no HII.

O editor conta o JSON integral: metadados e linhas vazias entram nas 500 linhas;
CRLF equivale a LF e uma quebra final nao acrescenta linha. Nao ha truncamento.
O limite adicional de transporte e 200000 bytes UTF-8.

Cada edicao cria revisao com hash e remove a aprovacao anterior. A API rejeita
edicao concorrente com 412, preservando a proposta no editor. Copie sua proposta
antes de recarregar a pagina para comparar com a revisao atual. A execucao existente
mantem sua fonte; editar o card nao muda o plano que ja recebeu.

O backend persiste a intencao antes de criar sessao/pedido e reutiliza as mesmas
chaves apos perda de resposta ou recarga. "Consultar/reconciliar envio" consulta a
mesma intencao; confirmacao significa recebimento, nao conclusao. Sessao, execucao,
status e motivo retornados pelo HII ficam vinculados a revisao.

Microtarefas aceitam agente, IA/modelo, dependencias, arquivos, saida e criterios.
O HII executa o DAG em serie. Criterios usam somente build/test/lint/typecheck
resolvidos pelo contrato local, sem shell enviado pelo documento. Critérios
obrigatorios sem verificador bloqueiam o despacho.

Limites atuais: dependencias entre tarefas de produto bloqueiam o despacho ate
haver conciliacao verificavel no motor; nao sao marcadas satisfeitas por texto.
E2E/observabilidade/logging e demais instrucoes operacionais ficam preservados
na fonte, mas nao viram validadores novos automaticamente. Gates existentes
continuam valendo; nao houve inferencia real de IA nesta validacao.

## Contrato compartilhado

O validador TypeScript puro e copiado do HII para o build Nuxt (sem dependencia
de caminhos externos em runtime). Ao atualizar o motor:

    HII_TEST_CHECKOUT=/caminho/do/hii node scripts/sincronizar-tecnico.mjs
    HII_TEST_CHECKOUT=/caminho/do/hii node scripts/sincronizar-tecnico.mjs --check

Este incremento atende parte de #21; DAG paralelo e reconciliacao de dependencias
continuam pendentes e a issue nao deve ser fechada automaticamente.
