# Análise do motor pelo Claude

Pasta separada para a leitura do Claude sobre a independência do motor HII em relação a fornecedores de IA e recursos proprietários, mantida ao lado da leitura do Codex para comparação lado a lado.

| Documento | Autor | Caminho |
| --- | --- | --- |
| Proposta do Codex | Codex | [../analise-motor-independente-codex.md](../analise-motor-independente-codex.md) |
| Complemento distribuído | Codex | [../arquitetura-execucao-distribuida-hii.md](../arquitetura-execucao-distribuida-hii.md) |
| Proposta do Claude | Claude | [analise-motor-independente-claude.md](analise-motor-independente-claude.md) |

## Como esta leitura foi produzida

Inspeção em 03/10/2026 e 04/10/2026 sobre HII 6248cb1, Hicode 56e8e57 e hicode-site 3919128, com a mesma engenharia do documento do Codex: fato lido no código com arquivo e linha, implicação por fato, proposta separada de observação, sequência com aceite verificável.

1. Oito leitores independentes, um por subsistema: `motor/tomada`; `motor/agentes` com `ciclo/agente.ts`, `cascudo` e skills; `runner.ts` com `oswaldo` e `euclides`; `ciclo` com `niemeyer` e configs; `api` com `cordel`; `quilombo`, `mirante` e implantação; painel Hicode; projetos-alvo e documentos operacionais. Cada um devolveu até oito achados com arquivo e linha, o que já é neutro, veredito sobre as afirmações do Codex e perguntas abertas.
2. Um cético por achado, instruído a refutar relendo o código e seguindo importações. Dos 64 achados, 40 receberam cético: 37 confirmados, 3 refutados na implicação. Os 24 restantes (implantação, painel, alvos) foram conferidos pelo redator por leitura direta das linhas citadas.
3. Os vereditos dos leitores sobre afirmações do Codex marcadas como "parcial" ou "refutado" também passaram por cético; dois foram corrigidos para "confirmado" (Canudos substitui o crivo no caso visual; adaptador Codex declara ausência de agents, visão e MCP).
4. Três propostas independentes a partir do mesmo dossiê: núcleo neutro primeiro, evolução mínima com segurança operacional, produto e fronteira. Um juiz pontuou evidência, independência, risco, acionabilidade e honestidade, preferiu a de evolução mínima e listou enxertos e quatro erros factuais, que foram conferidos no código.
5. Um crítico de completude comparou o material com os dois documentos do Codex e com o pedido, apontou lacunas (estados, hicode-site, gate de arte, lock, aceites distribuídos, agendamento, Gemini) e afirmações a qualificar; todas foram tratadas no texto.
6. Síntese e redação pelo Claude, sem executar testes, sem chamar IA real e sem tocar cards, locks, PIDs ou configuração da instalação ativa.

## Como comparar com o Codex

A seção "Vereditos sobre o documento do Codex" lista cada afirmação da tabela de fatos do Codex com confirmado, parcial ou refutado e a evidência. A seção "Divergências e complementos" registra concordâncias e quatorze pontos de diferença, com o motivo ancorado em arquivo e linha. As duas leituras compartilham a mesma arquitetura-alvo e divergem principalmente na ordem: o Codex começa pelo protocolo distribuído; o Claude começa por provar a independência localmente com um harness sem CLI, catálogo neutro de papéis, custo e aprovação no backend.
