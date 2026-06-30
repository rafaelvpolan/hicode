# 02 — Catálogo de Agentes

São **14 agentes de domínio** + **1 gate de revisão** (Crivo). Cada um tem um escopo
estreito de propósito: escopo estreito = prompt de sistema afiado = menos alucinação,
menos "echo" (vários agentes re-sinalizando a mesma coisa) e revisão mais barata.

## Resumo

| Agente | Modelo | Gated? | Escreve código? | Domínio |
|--------|--------|--------|-----------------|---------|
| **limpio** | sonnet | ✅ gated | ✅ | Clean code, SOLID, TDD, arquitetura, features |
| **escudo** | sonnet | ✅ gated | ✅ | Segurança: OWASP, secrets, auth, CVE, IaC |
| **testudo** | sonnet | ✅ gated | ✅ (testes) | Testes: cobertura, mutation, performance |
| **rufus** | opus | ✅ gated | ✅ | Refactor seguro sem mudar comportamento |
| **radix** | sonnet | ✅ gated | ✅ | Banco/dados: schema, migrations, índices, queries |
| **celer** | sonnet | ✅ gated | ✅ | Performance: profiling, otimização (mede antes/depois) |
| **crivo** | opus | — (é o gate) | ❌ read-only | Revisão adversarial; veredito vinculante |
| **quaero** | sonnet | não | ❌ read-only | Pesquisa externa: libs, docs, RFCs, trade-offs |
| **pluto** | sonnet | não | ❌ read-only | Dead-code: detecta e recomenda (não deleta) |
| **vitro** | sonnet | não | ✅ | Frontend: React / React Native / Solid.js |
| **corvinus** | opus | não | ✅ | Observabilidade: logs, métricas, tracing, RCA |
| **glossia** | haiku | não | ✅ (docs) | Documentação: README, ADR, OpenAPI, diagramas |
| **fulgor** | sonnet | não | ✅ (.html) | Dashboards/apresentações HTML single-file |
| **continuum** | sonnet | não | ✅ (propõe) | CI/CD, IaC, Docker, deploy (gera, não aplica) |
| **pura** | haiku | não | ✅ | Remove comentários (só isso) |

**Gated** = o trabalho dele passa obrigatoriamente pelo **Crivo** antes de ser
considerado pronto. **Read-only** = só lê/analisa, não edita arquivos do projeto.

### Como os agentes conversam (não pisam no mesmo prego)

- **Pluto → Rufus**: Pluto *detecta* dead-code, Rufus *remove*.
- **Rufus ↔ Limpio ↔ Escudo**: refactor (Rufus) sinaliza problema de arquitetura para
  Limpio e de segurança para Escudo, em vez de resolver fora do escopo.
- **Radix ↔ Celer**: query lenta por índice/plano é Radix; hot path em CPU/memória é Celer.
- **Vitro → Glossia/Corvinus/Escudo**: frontend sinaliza contrato sem doc, evento sem
  instrumentação, token exposto.
- **Um dono por preocupação**: numa revisão de segurança, chame só Escudo — não Limpio +
  Rufus + Escudo no mesmo arquivo. Cada um sinaliza fora-de-domínio em uma linha `[→ Agente]`.

---

## Os gated (passam pelo Crivo)

### limpio — engenharia de código limpo
Gera, revisa e refatora código com foco em correção, SOLID, clean architecture e TDD,
sem superengenharia. **Chame quando:** implementar feature nova, revisar qualidade,
forçar limites de camada. **Não chame quando:** o objetivo é só segurança (→ escudo),
só performance (→ celer) ou só refactor sem feature (→ rufus). Entrega `## Summary`
(Changed/Validated/Pending) ou `## Findings` (must/should/consider).

### escudo — segurança
Pensa como atacante: OWASP Top 10, secrets, auth/authz, cripto, supply chain (CVE via
WebSearch/WebFetch), IAM, C++ embarcado. **Critical bloqueia a tarefa.** **Chame quando:**
auditar auth, caçar secrets, revisar IaC, validar input. Entrega review com severidade
(Critical/High/Medium/Low) e veredito `BLOCKED`/`CLEARED`.

### testudo — testes
Cobertura (mínimo 90% de branch; 100% no domínio), mutation testing (≥80% no domínio),
testes de performance. Testa **comportamento**, não implementação. **Chame quando:**
escrever testes, criar characterization tests antes de refactor, auditar qualidade do suite.

### rufus — refactor seguro (opus)
Melhora código existente **sem mudar comportamento observável nem contratos públicos**.
Testes primeiro (escreve characterization se faltar), um conceito por commit, sem
abstração especulativa. Atualiza deps (patch/minor aplica; major só propõe). **Chame
quando:** reduzir complexidade, eliminar duplicação, remover dead-code (após Pluto).

### radix — banco e camada de dados
Schema, migrations seguras (expand→backfill→contract, rollback testado), índices a
partir de queries reais, planos `EXPLAIN`, N+1, integridade. **Dados vencem conveniência.**
**Chame quando:** mudar schema, query lenta, risco de integridade, revisar migration.

### celer — performance (mede antes/depois)
Profiling de CPU/memória/I-O, complexidade algorítmica, cache, concorrência. **Nada de
otimizar sem baseline.** Otimiza o hot path comprovado, não o palpite. **Chame quando:**
regressão de latência/throughput, trabalho de otimização com número alvo.

---

## O gate

### crivo — revisão adversarial (opus, read-only)
Roda **depois** de um agente gated. Socrático e sem lealdade ao agente revisado: verifica
de forma independente (lê o código, o git, os arquivos relacionados — não confia no
resumo). Avalia design/abstração/acoplamento, bugs/edge cases, qualidade de teste,
segurança, simplicidade e a coerência entre o que o agente disse e o que o diff mostra.
Veredito vinculante: **APPROVED / CONDITIONAL / BLOCKED**. No pipeline do Nexus, o modelo
do Crivo escala com o risco: `opus` + verificação profunda para risco alto (segurança,
concorrência, dados, regra de negócio); `sonnet` + revisão leve para mudanças triviais.

---

## Os não-gated

### quaero — pesquisa externa (read-only)
Investiga o que vive **fora** do repo: avaliação de libs, comparação de abordagens, specs/
RFCs, changelogs, EOL. Rotula **fato/consenso/inferência** e cita fonte + versão/data.
Dá **uma** recomendação + runner-up. **Use up-front**, antes de qualquer gated implementar
com base em lib/abordagem nova.

### pluto — dead-code (read-only)
Acha código inalcançável, símbolos/imports/exports sem uso, arquivos órfãos, flags
obsoletas. Conservador: rotula **confirmed / likely / suspected** (DI, reflection, dynamic
import e API pública nunca passam de "likely"). **Não deleta** — entrega plano de remoção
para o Rufus.

### vitro — frontend
React (desktop), React Native (mobile), Solid.js (embarcado). Lê o projeto antes de tocar,
TypeScript sem `any`, tokens de design (sem cor/spacing hardcoded), acessibilidade WCAG AA,
estados loading/error/empty obrigatórios, contrato de API tipado. **Chame quando:**
componente, integração back→front, review de frontend, state architecture.

### corvinus — observabilidade (opus)
Instrumenta código (logs estruturados, 4 golden signals, tracing com traceId) e analisa
incidentes (RCA com timeline). Padrão AWS CloudWatch; Grafana/Prometheus quando presente.
Sem alerta sem runbook; sem PII em log. **Chame quando:** adicionar instrumentação, definir
SLO/alarme, fazer root cause analysis.

### glossia — documentação (haiku)
README, ADR (`docs/adr/NNNN-*.md`), OpenAPI (auto/semi/manual), diagramas Mermaid. Documenta
**o que não é óbvio**, sempre verificado contra o código (flag `[NEEDS VERIFICATION]` /
`[SPEC MISMATCH]`). Produz um *Documentation Plan* antes de escrever.

### fulgor — dashboards & apresentações HTML
Artefatos `.html` single-file (zero build) para stakeholders: dashboard executivo,
infográfico/pôster, artboard de arquitetura C4, slide deck (reveal.js). Tailwind + Chart.js
+ SVG, dados embutidos inline (funciona offline), **nunca inventa métrica**. **Chame quando**
o público é executivo/não-técnico e o pedido é "slides", "dashboard", "infográfico", "pôster".

### continuum — CI/CD & infra
GitHub Actions, Terraform, Dockerfile, deploy ECS/Lambda. **Lê antes de escrever** e
**gera artefatos, nunca aplica** (todo output é proposta para revisão humana). Extende o que
existe; sinaliza `[NEW TOOL]` / `[PERMISSION REQUIRED]`. Nunca automatiza `terraform apply`
de produção.

### pura — remove comentários
Faz só isso: remove comentários preservando lógica, formatação, shebangs, referências de
ticket e avisos legais. **Inclua no pipeline só quando houve código novo/alterado com
comentários a tirar** (preferência do dono: código sem comentários).

---

Próximo: [`03-prompting-opus-4.8.md`](03-prompting-opus-4.8.md) — como pedir bem em cada nível.
