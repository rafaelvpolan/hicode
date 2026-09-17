# Progresso de produto com evidencias

A pagina de planejamento tem "Consultar evidencias do epico". A consulta e da
revisao salva: edicoes no formulario so entram depois de salvar. A pagina tecnica
tambem consulta os criterios da execucao vinculada sem reenviar pedidos.

O backend negocia avaliacao v1 com o HII. Motor antigo/offline, permissao recusada
ou dados inconsistentes ficam visiveis; nada e marcado concluido por ausencia de
resposta. As leituras sao paginadas em 20 tarefas, com no maximo quatro consultas
simultaneas. A conclusao do epico so aparece com todas as paginas, IDs unicos,
dependencias sem ciclos e todos os filhos concluidos com evidencia.

## Como o estado e derivado

- Sem execucao ou nova revisao pendente: nenhuma evidencia anterior e reaproveitada.
- Bloqueada: aguarda despacho, esclarecimento, recurso ou porta humana.
- Interrompida: HALTED do motor; nao e transformado em cancelamento definitivo.
- Falhou: criterio obrigatorio reprovado com evidencia atual.
- Em execucao: estado ativo reconhecido no motor.
- Aguarda revisao: PR_OPEN com criterios aprovados; PR aberto nao conclui o produto.
- Concluida com evidencia: MERGED/DEPLOYED, modo passivo e todos os criterios
  obrigatorios aprovados com prova atual.
- Inconclusiva: evidencia ausente, antiga, incompleta, indisponivel, resposta
  contraditoria, status desconhecido ou terminal gateway sem prova do pipeline.

Antes de derivar estado, o painel confere projeto, execucao, produto, planejamento,
revisao da origem e hash da fonte tecnica aprovada. Cada criterio de produto usa
criterio-1, criterio-2 etc. do template, com descricao preservada e obrigatoriedade.
Se editar esses vinculos, o progresso informa falta de cobertura; nao presume
equivalencia por texto de IA. Um ID manual e navegavel/informativo, mas nao
comprova cobertura sem uma revisao tecnica aprovada vinculada.

Alteracao de planejamento/card tecnico durante a consulta invalida a resposta.
As consultas sao observacoes datadas: nao autorizam despacho, retry ou merge.
Registros antigos permanecem legiveis; a nova tela so habilita prova quando o
motor anuncia o contrato. Nenhum estado operacional e escrito pelo Hicode.

## Evidencias e limites

Os detalhes mostram resultado atual e historico, comando, saida redigida, timeout,
exit code, duracao, tentativa/revisao e instante. Fonte Vue escapada, sem HTML de
logs. Worktree removido sem certificado torna a atualidade indisponivel, mesmo
com merge registrado. A prova arquivada e descrita abaixo. A liberacao de
dependencias de produto para despacho permanece pendente.

Teste integrado: descoberta → epico → tecnico → despacho → criterios ausentes
visiveis → epico nao concluido, em 1365/390px. Fixtures do motor exercitam comando
real, prova atual, arquivo novo, relatorio incompleto e worktree removido. Testes
do painel cobrem merge comprovado, PR aberto, revisao diferente, cobertura parcial,
escopo, falha, parada humana, pagina incompleta e ciclos, sem usar IA real.

## Entrega arquivada

O HII pode fornecer o campo opcional entrega com o commit validado, a arvore Git,
o PR e o commit integrado. O painel mostra essa proveniencia junto aos criterios.
Com certificado valido e consulta remota consistente, remover o worktree nao
impede a conclusao do produto. Novo head, arvore integrada diferente, PR fechado
ou GitHub indisponivel tornam a verificacao inconclusiva. Execucoes antigas sem
certificado continuam sem prova quando o worktree foi removido. Nao comprova deploy.

A CI fixa o commit HII que fornece o contrato e a fixture. O E2E usa Git real e
transporte HTTP, com GitHub controlado: conclui o epico apos limpar o worktree e
retira a conclusao quando o head remoto diverge. A extensao nao libera despacho
de dependencias nem modifica a fila.
