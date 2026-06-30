# 07 — Prompts difíceis e receitas (o playbook prático)

Este é o documento para deixar aberto no dia a dia. Duas metades que se completam:

- **Prompts difíceis** — os dúbios e os longos, com uma galeria de exemplos **citados**
  (antes → depois) e **5 modelos completos** de prompts longos e detalhados (Parte 2),
  porque conselho abstrato não ensina ninguém a escrever prompt.
- **Receitas** — blocos prontos e curtos por cenário, já no nível de máquina certo e fechando
  o gate (Parte 3).

> Convenção: nomeio o agente em **negrito** para deixar previsível. Com o `CLAUDE.md`
> instalado, muitas vezes o roteamento acerta sozinho — mas nomear nunca atrapalha.
> Referências de nível (N0–N4), effort e janela estão no [doc 03](03-prompting-opus-4.8.md).

---

# Parte 1 — Prompts dúbios (ambíguos)

Um prompt é dúbio quando admite mais de uma leitura razoável. O modelo então **adivinha** — e
a aposta costuma sair genérica ou ancorada na interpretação mais óbvia, que pode não ser a
sua. Sintomas: referente solto (*"arruma isso"*), objetivo ausente (diz a ação, não o
resultado), metas em conflito, critério de "pronto" só na sua cabeça.

O conserto quase sempre é aplicar os 6 elementos do [doc 03](03-prompting-opus-4.8.md):
**objetivo · contexto · restrições · critério de pronto · formato · escopo.** Uma frase por
item já resolve. A galeria abaixo mostra isso na prática.

## Galeria: antes → depois (exemplos citados)

### 1. Bug de autenticação
❌ **Dúbio:** *"o login tá com problema, dá uma olhada"*
→ *Problema* qual? Erro 500? Aceita senha errada? Lento? Token não expira? O modelo vai
chutar e provavelmente "revisar o login" genericamente.

✅ **Forte (N1 → escudo, é segurança):**
> "Use o **escudo**: em `src/auth/login.controller.ts`, um token JWT continua válido após o
> logout — dá pra reusar o token de uma sessão encerrada. Confirme onde a invalidação deveria
> acontecer, aponte o vetor e a remediação. **Não conserte ainda** — quero o relatório com
> severidade primeiro. Se o fix exigir mexer no fluxo de auth, sinalize antes de tocar."

### 2. "Deixa mais rápido"
❌ **Dúbio:** *"a tela de pedidos tá lenta, otimiza aí"*
→ Sem baseline nem alvo, o modelo otimiza no escuro e "acha" que melhorou.

✅ **Forte (N1 → celer):**
> "Use o **celer**: a rota `GET /orders` está em ~1.2s no p95 (medido em produção, payload de
> ~200 pedidos). Faça profiling, ache o gargalo dominante e aplique a **menor** mudança que
> derrube isso para **<300ms**, medindo antes/depois e preservando o comportamento. Se for
> índice ou plano de query, passe para o **radix** em vez de otimizar no código."

### 3. "Adiciona testes"
❌ **Dúbio:** *"esse módulo precisa de testes"*
→ Quais? Unit? Integração? Cobrir o quê? Qual a meta? O modelo escreve uns testes felizes e
declara pronto.

✅ **Forte (N1 → testudo):**
> "Use o **testudo**: o módulo `billing/` (domínio) não tem testes. Quero **≥90% de branch**
> no domínio, testando **comportamento** (não implementação): caminho feliz, valores limite,
> input inválido e o caso de cobrança duplicada. Use o framework já configurado (não
> introduza novo). Reporte a cobertura antes → depois e qualquer `[COVERAGE RISK]`."

### 4. "Melhora o tratamento de erro"
❌ **Dúbio:** *"o tratamento de erro aqui tá ruim, melhora"*
→ "Ruim" como? Engole exceção? Vaza stack trace? Falha em silêncio?

✅ **Forte (N1 → corvinus, é observabilidade/silent failure):**
> "Use o **corvinus**: em `src/webhooks/asaas.handler.ts`, falhas de processamento são
> engolidas num `catch` vazio — o webhook responde 200 e a gente perde o evento sem log nem
> métrica. Instrumente: log estruturado no boundary, métrica de erro por tipo, e propague o
> `traceId`. **Sem PII no log.** Não mude a lógica de negócio — só torne a falha observável.
> Aponte se algum outro handler tem o mesmo padrão."

### 5. "Atualiza as dependências"
❌ **Dúbio:** *"atualiza as libs do projeto"*
→ Todas? Inclusive major com breaking change? Aplica direto ou propõe?

✅ **Forte (N1 → rufus):**
> "Use o **rufus**: rode o outdated e atualize **só patch e minor**, rodando os testes após
> cada grupo. **Major, apenas proponha** com o resumo do breaking change — não aplique. Se
> alguma lib tiver CVE, **pare e sinalize ao escudo** em vez de mexer. Liste o que ficou de
> fora e por quê."

### 6. "Refatora o X"
❌ **Dúbio:** *"o `OrderService` tá feio, refatora"*
→ Objetivo? Reduzir complexidade? Tirar duplicação? E pode mudar comportamento?

✅ **Forte (N1/N2 → rufus + crivo):**
> "Use o **rufus**: reduza a complexidade do `OrderService.process()` (hoje com ~18 de
> complexidade ciclomática) **sem mudar comportamento observável nem a assinatura pública**.
> Confirme cobertura antes (escreva characterization tests se faltar); um conceito por commit.
> O que vir fora do escopo (ex.: violação de camada), **sinalize e pare**. Feche com o
> **crivo** (risco baixo)."

### 7. "Revisa o PR"
❌ **Dúbio:** *"revisa esse PR pra mim"*
→ Revisar procurando o quê? Bug? Segurança? Estilo? Testes? Cada um é um agente.

✅ **Forte (escolha o eixo):**
> "Quero três olhares no diff do PR #142, **um dono por eixo**: **escudo** para segurança,
> **testudo** para a qualidade/cobertura dos testes, e **limpio** para arquitetura/SOLID.
> Rode em paralelo, cada um só no seu eixo, e me dê um consolidado. Não quero três revisões
> redundantes do mesmo arquivo."

### 8. Decisão técnica em aberto
❌ **Dúbio:** *"qual fila usar aqui?"*
→ Sem restrições, vira opinião genérica.

✅ **Forte (N1 → quaero, up-front):**
> "Use o **quaero**: preciso escolher entre **BullMQ** e **SQS** para processar webhooks do
> Asaas. Restrições: já rodamos em ECS/Fargate, Node 22, e o pico é ~500 eventos/min com
> necessidade de retry e dead-letter. Compare com fontes citadas, recomende uma e o runner-up
> com a condição de troca. **Não implemente.**"

## Padrão "peça para desambiguar antes" (quando você não tem os detalhes)

Às vezes você *não sabe* os detalhes — e tudo bem. Vire a ambiguidade num check barato:

```
Antes de implementar, me diga: (a) como você entendeu a tarefa, (b) as suposições que vai
assumir, (c) o que mudaria se a suposição <X> estiver errada. Só comece depois que eu confirmar.
```

Isso corrige o entendimento **antes** de qualquer código existir. É o espírito do
`brainstorming` antes de implementar.

## Padrão "ação cara → confirme antes"

Regra: **ação barata e reversível** → o modelo deve assumir o padrão sensato e seguir, dizendo
o que assumiu. **Ação cara ou irreversível** → deve perguntar antes.

❌ **Perigoso:** *"limpa os usuários inativos do banco"*
→ "Inativos" pelo quê? Por quanto tempo? Soft ou hard delete? Em qual ambiente?! Isso pode
apagar dados de produção.

✅ **Forte:**
> "Use o **radix**: quero **propor** a remoção de usuários inativos (sem login há >24 meses
> **e** sem pedidos). **Não execute nada.** Me dê: a query de seleção (com `COUNT` primeiro),
> o plano (soft-delete via flag, não hard-delete), o risco de FK, e o rollback. Eu confirmo
> antes de qualquer escrita."

Você pode forçar qualquer um dos lados no prompt: *"não pergunte, escolha o padrão óbvio e me
diga o que assumiu"* ou *"isto apaga dados — confirme comigo antes de qualquer passo"*.

---

# Parte 2 — Prompts longos (dois ou três parágrafos)

Prompt longo não é problema — prompt longo **mal estruturado** é. Estrutura que funciona:
**(1) primeira frase = o objetivo** (é a âncora); (2) contexto; (3) restrições; (4) no fim, o
**critério de pronto** e o **formato de saída**. Início e fim concentram atenção (primazia e
recência) — ponha ali o que **não pode** ser perdido. Use listas, mesmo informais.

## Armadilha 1 — Contradição entre parágrafos

❌ **Antes:**
> "Refatora o `ReportExporter` pra ficar mais limpo e organizado, separando responsabilidades.
>
> O importante é não mudar nada do comportamento atual porque tem cliente consumindo o CSV.
>
> Ah, e aproveita pra trocar o formato de data pra ISO 8601, que o atual tá inconsistente."

→ §2 diz "não mude nada"; §3 manda mudar o formato de data (que é comportamento observável do
CSV que o cliente consome). O modelo vai obedecer um dos dois — e você não sabe qual.

✅ **Depois (conflito resolvido explicitamente):**
> "**Objetivo:** refatorar `ReportExporter` para separar geração de dados da formatação, **sem
> mudar o CSV de saída** — há cliente consumindo. **Exceção única e intencional:** o campo de
> data deve passar a ISO 8601 (`createdAt`), porque hoje está inconsistente; **todos os outros
> campos ficam idênticos**. **Pronto quando:** um teste de snapshot prova que o CSV só difere
> no campo de data. Use o **rufus** e feche com o **crivo** (risco baixo)."

## Armadilha 2 — Restrição crítica enterrada no meio

❌ **Antes:**
> "Implementa o endpoint de reembolso. Ele recebe o `paymentId`, valida se o pagamento existe
> e está pago, chama a API do Asaas pra estornar, atualiza o status local, e — isso é
> importante — **tem que ser idempotente, dois requests iguais não podem gerar dois estornos**
> — e por fim dispara o evento `RefundIssued` pro resto do sistema."

→ A regra que mais importa (idempotência) está soterrada numa oração no meio de uma frase
gigante. Alta chance de virar um detalhe secundário na implementação.

✅ **Depois (a regra crítica sobe e vira critério de pronto):**
> "**Objetivo:** endpoint de reembolso **idempotente** — dois requests com o mesmo `paymentId`
> geram **um** estorno só (garantia no nível do banco, não só no controller).
> **Fluxo:** valida pagamento existe + está pago → chama o estorno no Asaas → atualiza status
> local → dispara `RefundIssued`.
> **Pronto quando:** existe teste provando que 2 requests concorrentes iguais resultam em 1
> estorno e 1 evento. Use **/nexus** (Limpio implementa, Testudo cobre o caso concorrente,
> Crivo risco alto)."

## Armadilha 3 — Três tarefas disfarçadas de uma

❌ **Antes (um "prompt" que é um projeto):**
> "Cria a feature de exportação agendada de relatórios: um job que roda todo dia, gera o CSV,
> sobe no S3 e manda o link por e-mail. Precisa de teste, tem que ser seguro porque tem dado
> de cliente, e documenta o endpoint de configuração do agendamento. Cuida do deploy também."

→ Isso é código + testes + segurança + docs + CI/CD. Num prompt N0 vira um monólito sem gate.

✅ **Depois (vira um pipeline — `/nexus`):**
> "/nexus implementar **exportação agendada de relatórios** no módulo `reports/`:
> job diário → gera CSV → upload S3 → e-mail com link.
> - **Limpio**: job + service.
> - **Testudo**: cobre geração e o agendamento (≥90% no domínio).
> - **Escudo** (risco alto): expõe dado de cliente — valide acesso ao S3 e que o link expira.
> - **Glossia**: documenta o endpoint de configuração do agendamento.
> - **Continuum**: proponha o job no CI/deploy (não aplique).
> Gate Crivo após cada gated. Use o mínimo de agentes, um dono por preocupação. Confirme o
> pipeline antes de rodar."

## Teste do parágrafo
Releia seu prompt longo: *"um engenheiro novo, lendo só isto, saberia exatamente o que 'pronto'
significa e o que não pode tocar?"* Se não, o modelo também não saberá. O texto que não
responde a isso é ruído — corte.

## Modelos completos — prompts longos de verdade

As receitas da Parte 3 são curtas de propósito (tarefas rápidas). Estes aqui são o oposto:
**prompts longos e detalhados** para trabalho substancial, cada um demonstrando a anatomia
inteira — objetivo, contexto, restrições, critério de pronto, formato e escopo. Copie, adapte
os `<...>` e os caminhos de arquivo (são ilustrativos), e note **o porquê** sob cada um.

### A. Auditoria de segurança profunda — Escudo (sem corrigir, só mapear)
```
Use o **escudo** para uma auditoria de segurança do fluxo de autenticação + MFA. NÃO conserte
nada nesta passada — quero o mapa de risco primeiro.

Escopo: src/auth/ (login, refresh, logout), src/mfa/ (geração/validação de código e recovery
codes) e o middleware de proteção de rotas em src/middleware/auth.ts. Ignore o resto do repo.

Verificar, além da varredura OWASP padrão:
- Ciclo de vida do token: emissão, expiração, rotação no refresh, e se o logout REALMENTE
  invalida o token (ou só apaga no cliente).
- MFA: o código tem rate limit? expira? é de uso único? os recovery codes são hasheados em
  repouso? dá pra pular o 2º fator chamando direto uma rota protegida só com o token de 1º fator?
- Enumeração de usuário no login (mensagem/tempo de resposta diferentes para e-mail
  inexistente vs senha errada).
- Segredos: nenhum JWT secret/chave hardcoded; confirme que vêm de env/secret manager.

Como reportar: por achado — arquivo:linha, severidade, vetor de ataque concreto, impacto e
remediação. Separe "vulnerabilidade confirmada" de "security smell". Veredito final
BLOCKED/CLEARED.

Fora de escopo: não toque em código; mudança de arquitetura você sinaliza ao Limpio, não resolve.
```
**Por que é bom:** objetivo explícito (mapear, não corrigir), escopo cirúrgico, checklist que
vai além do default do agente, formato de saída fechado, e fronteira clara do que não fazer.

### B. Migração de schema arriscada — Radix (propor, não executar)
```
Use o **radix** para PROPOR (não executar) uma migração de schema. Quero o plano revisável
antes de qualquer escrita.

Objetivo: payments.status hoje é string livre e inconsistente ('paid', 'PAID', 'pago',
'overdue'...). Normalizar para enum controlado (PENDING|CONFIRMED|OVERDUE|REFUNDED|CANCELED)
sem perder histórico.

Contexto: payments é tabela quente, ~8M de linhas, em produção (Postgres), com FKs de refunds
e invoices. O mapeamento dos valores atuais → enum está em docs/payment-status-map.md — use-o
como fonte. Se aparecer um valor não mapeado, PARE e me pergunte, não chute.

Exigências da migração:
- Padrão expand → backfill → contract, em passos separados (nunca schema + backfill juntos).
- Cada passo com rollback testado; me diga risco de lock/rewrite e tempo estimado do backfill
  de 8M linhas (em lotes, não num UPDATE único).
- A coluna nova entra nullable + default, backfill em lote, e só depois vira NOT NULL.
- Confirme com EXPLAIN que constraints/índices novos são usados; não derrube o índice atual de
  status antes do contract.

Como reportar: arquivos de migração (forward + rollback) como proposta, plano de execução
numerado, e os pontos [REVIEW REQUIRED]. Feche com o **crivo** em risco alto. Não rode migrate —
eu executo.
```
**Por que é bom:** separa "propor" de "executar" (ação cara/irreversível), contexto numérico
real, regras de segurança específicas do domínio, fonte de verdade citada + "pare e pergunte",
e gate de risco alto.

### C. Investigação de performance — Celer (com método, baseline e alvo)
```
Use o **celer**: investigue e otimize a lentidão do relatório de vendas.

Sintoma medido: GET /reports/sales?range=90d está em ~4.5s no p95 (staging com dados de
produção espelhados, tenant grande ~120k pedidos no range). Alvo: p95 < 800ms.

Método que espero:
1. Reproduza e registre o baseline (mesma condição: range 90d, tenant grande).
2. Profiling: me diga onde está o custo dominante — não otimize por palpite.
3. Aplique a MENOR mudança que ataque o gargalo. Se o custo for query/índice (N+1, full scan,
   agregação sem índice), isso é do **radix** — passe para ele com o plano, sem gambiarra no código.
4. Re-meça na mesma condição, me dê o delta, e confirme que os números do relatório não mudaram
   (performance é refactor com número — o contrato não muda).
5. Pare ao bater o alvo ou quando o próximo ganho não valer a complexidade; declare os retornos
   decrescentes.

Restrições: sem cache novo sem invalidação correta; sem mudar o formato da resposta da API.
Como reportar: baseline → gargalo → mudança → resultado (com números) + flags para o Radix se
for o caso. Feche com o **crivo**.
```
**Por que é bom:** baseline e alvo concretos, método numerado, handoff condicional para o
Radix, preservação explícita do contrato, e critério de parada (retornos decrescentes).

### D. Refactor multi-módulo — `/nexus` (testes antes, comportamento intacto)
```
/nexus quebrar o OrderService inchado (~900 linhas, complexidade alta) em colaboradores coesos,
SEM mudar comportamento observável.

Contexto: src/orders/order.service.ts hoje faz validação, cálculo de preço/imposto, chamada ao
gateway de pagamento (Asaas), persistência e disparo de eventos — tudo num lugar. Consumido por
OrderController e por dois jobs. Tem testes, mas cobrem só o caminho feliz.

Plano que espero (confirme comigo antes de rodar):
- Testudo PRIMEIRO: characterization tests do comportamento ATUAL (inclui erro do gateway,
  imposto por região, pedido vazio) — rede de segurança antes de mexer.
- Rufus: extraia colaboradores (ex.: PricingCalculator, PaymentGatewayAdapter,
  OrderEventPublisher) com injeção de dependência, um conceito por commit, rodando os testes a
  cada passo. NÃO mude assinaturas públicas de OrderService consumidas fora.
- Crivo (risco alto): verifique comportamento idêntico e ausência de acoplamento novo / violação
  de camada.

Fora de escopo: nada de feature nova; nada de mudar o contrato HTTP. Achou problema de segurança
no fluxo de pagamento? Sinalize ao **escudo**, não resolva aqui.
Pronto quando: a suíte antiga + a nova passam, e OrderService virou um orquestrador fino que só
delega aos colaboradores.
```
**Por que é bom:** ordem imposta (testes antes do refactor), colaboradores nomeados como
sugestão (não imposição), invariante claro (comportamento idêntico), fronteiras de escopo e de
contrato, e gate de risco alto.

### E. Auditoria exaustiva via Workflow — escala (N4)
```
use a workflow para uma auditoria EXAUSTIVA de autorização (broken object-level authorization /
IDOR) em toda a API.

Escopo: todos os controllers/handlers sob src/** que recebem um id de recurso (/orders/:id,
/customers/:id, /invoices/:id, ...).

O que procurar: rotas que carregam um recurso por id SEM checar se ele pertence ao tenant/usuário
autenticado — onde o usuário A lê/altera o recurso do usuário B só trocando o id.

Como quero que rode:
- Fan-out por área (orders, customers, billing, subscriptions, mfa) — cada finder cego aos outros.
- Para cada achado, verificação adversarial em 3 votos independentes (a checagem de ownership
  realmente falta? existe num middleware/policy que o finder não viu? o recurso é público de
  propósito?). Descarte o que não sobreviver à maioria.
- Loop até 2 rodadas seguidas sem achado novo. Sem corte silencioso: se limitar algo, me diga o
  que ficou de fora.

Entrega: só os confirmados, agrupados por severidade, cada um com arquivo:linha, o id exposto, o
request de exploração e a remediação (policy/escopo de query). Seja exaustivo — priorize
cobertura sobre custo. NÃO conserte — é relatório.
```
**Por que é bom:** define a classe de bug com precisão, especifica a topologia do workflow
(fan-out, verificação adversarial, loop-until-dry, sem corte silencioso), formato de entrega
acionável, e deixa claro que é diagnóstico, não correção.

> Repare no padrão comum aos cinco: **a primeira linha já diz o objetivo e o modo** (auditar /
> propor / otimizar / refatorar / varrer), o corpo dá contexto e restrições, e o fim fixa
> **formato de saída + escopo + gate**. É a anatomia do [doc 03](03-prompting-opus-4.8.md)
> esticada para uma tarefa grande.

---

# Parte 3 — Receitas prontas (copia e cola)

Troque os `<...>`. Cada receita já vem no nível certo e fechando o gate quando precisa.

## Feature nova (N3 — `/nexus`)
```
/nexus implementar <feature> em <módulo/arquivo>.
Critério de pronto: comportamento <X>, testes cobrindo <casos> (Testudo, ≥90% branch no domínio).
Restrições: não mudar contratos públicos de <Y>; seguir o padrão de <arquivo de referência>.
Gate: Crivo após cada mudança. Documente <o que> com Glossia.
```

## Feature sensível (toca auth/dados/pagamento) (N3)
```
/nexus implementar <feature>. Como toca <auth|dados de cliente|pagamento>, trate como RISCO ALTO:
Limpio implementa, Escudo faz revisão de segurança, Testudo cobre os caminhos sensíveis,
Crivo no opus com verificação profunda. Não logar PII. Sem mexer no schema.
```

## Bug isolado (N1 + gate)
```
Use o **limpio**: em <arquivo:função>, <descrição do bug e do comportamento correto, com a fonte da regra>.
Conserte só essa função, adicione um teste que prove o comportamento correto, não mude a assinatura.
Depois passe pelo **crivo** (risco baixo).
```

## Refactor seguro, sem mudar comportamento (N1/N2)
```
Use o **rufus**: reduza a complexidade de <arquivo/módulo> sem mudar comportamento observável
nem contratos públicos. Confirme cobertura antes (escreva characterization tests se faltar),
um conceito por commit. Liste o que vir fora do escopo em vez de mexer. Feche com o **crivo**.
```

## Dead-code (N2 — Pluto detecta, Rufus remove)
```
Use o **pluto** para mapear dead-code em <escopo>, com nível de confiança (confirmed/likely/suspected)
e evidência. Depois o **rufus** remove só os "confirmed", rodando os testes após cada remoção.
Crivo no fim (risco baixo).
```

## Auditoria de segurança (N1 — só Escudo)
```
Use o **escudo**: auditoria de segurança de <fluxo/módulo>. Cubra OWASP, secrets, auth/authz e
validação de input. Para cada achado: localização, severidade, vetor, impacto e remediação.
Não conserte ainda — só me dê o relatório e o veredito.
```

## Query lenta / problema de dados (N1 — Radix)
```
Use o **radix**: a query <qual> / a rota <qual> está lenta. Leia o plano (EXPLAIN ANALYZE),
identifique o problema (índice ausente, N+1, full scan), proponha a correção com risco de lock/
rewrite e plano de rollback. Confirme que o índice novo é usado. Feche com o **crivo** (risco alto).
```

## Migration de schema (N1 — Radix, risco alto)
```
Use o **radix**: preciso <adicionar coluna NOT NULL <X> | renomear <Y> | criar índice em <Z>> na
tabela <tabela> (populada, em produção). Use expand→backfill→contract, rollback testado, e me diga
risco de lock/rewrite e linhas afetadas. NÃO combine schema + backfill no mesmo passo. Crivo risco alto.
```

## Regressão de performance no código (N1 — Celer)
```
Use o **celer**: <rota/função> está em <métrica atual> e o alvo é <métrica alvo>. Faça profiling,
ache o gargalo dominante, aplique a menor mudança que atinja o alvo, medindo antes/depois e
preservando comportamento. Se o gargalo for de banco, passe para o **radix**.
```

## Pesquisa de lib / decisão técnica (N1 — Quaero, up-front)
```
Use o **quaero**: preciso escolher entre <opção A> e <opção B> para <objetivo>, dadas as
restrições <runtime/versão/tamanho/deps>. Compare com fontes citadas (fato/consenso/inferência),
me dê uma recomendação e o runner-up com a condição de troca. Não implemente nada.
```

## Frontend — componente novo (N1 — Vitro)
```
Use o **vitro**: crie o componente <Nome> em <React|React Native|Solid>. Leia os padrões e os
tokens existentes antes. TypeScript sem any, acessibilidade WCAG AA, estados loading/error/empty,
contrato de API tipado. Teste junto. Sinalize qualquer mismatch de contrato em vez de coagir tipo.
```

## Observabilidade / RCA (N1 — Corvinus)
```
Use o **corvinus**: <instrumentar <fluxo> com logs estruturados + 4 golden signals + traceId>
OU <fazer root cause analysis do incidente <descrição/janela>>. Sem PII em log; todo alerta com
runbook. Me dê a timeline e a recomendação de instrumentação que teria pego isso antes.
```

## Documentação (N1 — Glossia)
```
Use o **glossia**: documente <o que mudou> — <README|ADR|OpenAPI|diagrama>. Verifique contra o
código real, flag o que não der pra confirmar. Atualize doc existente antes de criar nova.
Me mostre o Documentation Plan antes de escrever.
```

## Dashboard / apresentação para stakeholder (N1 — Fulgor)
```
Use o **fulgor**: gere um <dashboard executivo|infográfico|artboard C4|slide deck> single-file HTML
a partir de <fonte de dados>. Público: <executivo/não-técnico>. Só dados verificados (nada inventado),
offline, com rodapé de fonte e data. Me diga como abrir e exportar.
```

## CI/CD / infra (N1 — Continuum)
```
Use o **continuum**: <adicionar job de <X> ao pipeline | escrever Dockerfile multi-stage | módulo Terraform para <Y>>.
Leia o que já existe primeiro e me dê o Discovery Report antes da proposta. Gere artefato (não aplique),
sinalize [NEW TOOL]/[PERMISSION REQUIRED]. Sem segredo hardcoded, sem @latest.
```

## Limpar comentários (N1 — Pura)
```
Use o **pura**: remova os comentários de <arquivos/escopo>, preservando lógica, shebangs,
referências de ticket e avisos legais. Só me reporte arquivos e contagem.
```

## Auditoria ampla / varredura exaustiva (N4 — Workflow)
```
use a workflow: varra <escopo, ex.: todo o src/> atrás de <classe de problema>. Para cada achado,
verifique adversarialmente em 3 votos independentes (correção, segurança, reprodutibilidade);
descarte os que não sobreviverem. Continue até 2 rodadas sem achado novo. Me dê só os confirmados,
agrupados por severidade. Seja exaustivo — priorize cobertura sobre custo.
```

## Pipeline completo de entrega (N3 — `/nexus`, o "tudo")
```
/nexus entregar <feature> pronta para produção em <módulo>:
implementação (Limpio) + testes ≥90% no domínio (Testudo) + revisão de segurança se tocar dados (Escudo)
+ observabilidade no caminho crítico (Corvinus) + doc do que mudou (Glossia).
Gate Crivo após cada gated, risco alto onde envolver dados/concorrência. Use o mínimo de agentes
necessários, um dono por preocupação. Me confirme o pipeline antes de rodar.
```

---

## Dois lembretes que valem por dez receitas

1. **Dê critério de pronto.** Toda receita e todo "depois" acima tem um alvo/critério/restrição.
   É o que separa um resultado raso de um resultado certo.
2. **Feche o gate.** Resultado de agente gated (Limpio, Escudo, Rufus, Testudo, Radix, Celer)
   só está pronto depois do **crivo**. N2/N3 já fazem isso; em N1 manual, peça.

---

Voltar ao [README](../README.md) · [catálogo](02-catalogo-de-agentes.md) ·
[prompting por nível](03-prompting-opus-4.8.md) · [default × nexus](04-default-vs-nexus.md) ·
[memórias e sessões longas](06-memorias-e-sessoes-longas.md).
