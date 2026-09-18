# Recuperar uma tarefa no Hicode

O HII e a autoridade de execucao. O painel preserva o card original e solicita
diagnostico/importacao pela API; nao escreve EXECUTING na copia local vinculada.

1. No card parado, clique em **Diagnosticar recuperacao**.
2. Confira a origem, o inventario e os avisos. A transferencia e por arquivo;
   IDs numericos duplicados nao selecionam automaticamente outro card.
3. Use **Preservar e vincular ao HII**. A importacao nasce PAUSED.
4. Revise o worktree, branch e configuracao. A preparacao revalida os arquivos
   atuais e pode exigir novas chamadas de IA na etapa retomada.
5. Confirme a revalidacao; depois use **Retomar pelo motor**. A interface so
   apresenta a mudanca confirmada pela API.

Se a resposta se perder, recarregue e diagnostique novamente. A intencao e o
vinculo ficam em cards/recuperacao. Reconciliar o mesmo envio nao cria outro card.
A copia local permanece intacta e nao aceita uma segunda execucao independente.

Snapshots anteriores podem ser consultados e restaurados com revisao esperada.
A restauracao nao despacha IA nem reverte custos e historico. Configuracao
original desconhecida nao e apresentada como comprovada.

## Limites atuais

- Transferencia limitada a 1 MiB e 64 artefatos; excesso e recusado, nunca truncado.
- Plano/checkpoint legado ainda nao migrado, entrega externa ou worktree perdido
  bloqueiam a preparacao com motivo. Nao apagar o original para contornar o erro.
- As filas nao sao trocadas globalmente para recuperar uma tarefa.
- API indisponivel e estado inconclusivo; isso nao comprova daemon desligado.
- Configuracao da API fica no backend. Nenhum bearer vai ao navegador.

## Regressao integrada

Com um checkout candidato do HII que inclua a fixture:

    HII_TEST_CHECKOUT=/caminho/hii node scripts/test-recuperacao.mjs

O teste usa processos separados, filas temporarias, dois cards 020 e o 025,
preserva um worktree modificado, verifica reload e largura de 390px. A presenca
do daemon e simulada; nao executa IA ou cards operacionais. As verificacoes de
modelo real sao uma trilha diferente e nao sao provadas por esse E2E.


Vinculo ilegivel ou identidade invalida bloqueia a tarefa afetada, preserva os arquivos
e informa reconciliacao. Os demais cards continuam acessiveis. A leitura de estado
consulta no maximo quatro vinculos simultaneamente, com prazo total de cinco segundos.

Checkpoint: 208 testes passaram, um skip existente; tipos e build aprovados.
E2E de status e recuperacao aprovados em desktop e 390px, com API em processo
separado e presenca do daemon simulada, sem inferencia real.
