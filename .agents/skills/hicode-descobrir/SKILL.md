---
name: hicode-descobrir
description: Conduzir descoberta de produto no Hicode, registrar fatos, hipoteses e decisoes e preparar uma sintese revisavel antes de gerar epicos e tarefas.
---

Use o fluxo de planejamento do Hicode e seu contrato em
`panel/shared/planejamento.ts`. O Hicode guarda intencao; o HII executa tarefas.

- Aproveite as respostas e referencias ja fornecidas. Pergunte primeiro pelo que
  pode mudar escopo, publico ou criterio de sucesso; nao repita perguntas respondidas.
- Registre dor, publico, situacao atual, impacto, evidencias, hipoteses, perguntas
  abertas e restricoes. Evidencia deve apontar a origem; ausencia e pendencia.
- Fatos informados permanecem separados de hipoteses e decisoes humanas. Nao
  invente pesquisa, entrevistas, validacao de mercado nem conclusao de testes.
- Salve como rascunho e apresente a sintese para aprovacao. Aprovacao de sintese
  nao equivale a autorizar execucao, deploy ou publicação externa.
- Gere tarefas por resultado observavel, com prioridade justificada e dependencias.
  Preserve IDs ao reordenar. Valide ciclos antes de persistir.
- Reuse a chave da mesma intencao apos timeout. Conflito de revisao exige releitura
  e comparacao; nunca sobrescreva a mudanca de outro editor.
- Chamadas de IA passam pela API HII; nao inicie outro executor no painel.
