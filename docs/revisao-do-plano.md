# Revisao do plano antes do despacho

No card tecnico, um documento valido exibe o plano abaixo do editor e antes das
acoes de aprovacao e despacho. A previa mostra a ordem serial, o papel, o
provedor/modelo solicitado, as dependencias, a saida esperada e os arquivos
previstos. Cada etapa permite abrir sua instrucao e os criterios relacionados.

A ordem segue as ondas topologicas do executor HII, preservando a ordem do
documento entre microtarefas prontas na mesma onda. Microtarefas independentes
continuam executadas uma por vez. Esta visualizacao nao cria execucoes nem
introduz outro scheduler.

Sem atribuicao explicita de IA, a tela informa selecao pelo motor. Atribuicao
solicitada nao comprova disponibilidade, capacidade ou provedor efetivamente
usado: isso depende da validacao e dos registros de execucao do HII. Arquivos
previstos descrevem o plano; nao sao uma garantia de isolamento.

A previa acompanha o texto atual. Edicoes aparecem como previa e exigem nova
revisao aprovada para despacho. O documento ja enviado conserva seu vinculo.
Documento invalido, ciclo ou excesso de 500 linhas oculta a previa e apresenta
os erros do contrato; nunca continua exibindo um plano anterior valido.

## Verificacao e reversao

O E2E integrado cobre desktop (1365px) e celular (390px), duas IAs explicitas,
selecao pelo motor, dependencia declarada fora da ordem, abertura dos criterios
por teclado e invalidacao por ciclo. Os cenarios existentes continuam cobrindo
aprovacao, despacho, resposta perdida e retry.

As IAs desse cenario sao atribuicoes de fixture, sem inferencia real. Nao se
declara aptidao de modelos reais por esse teste.

A mudanca e somente de apresentacao: reverter o componente e sua inclusao no
editor remove a previa sem migrar revisoes, mudar intencoes ou cancelar tarefas.
