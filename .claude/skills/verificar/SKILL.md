---
name: verificar
description: "Auditoria manual do repositório INTEIRO (não do diff). Seleciona todo o código versionado com lib/runner/auditoria.ts — respeitando .gitignore, filtrando config/IaC/docs, ordenando por risco (monolito, god-file, arquivo sem teste) e dividindo em lotes por orçamento de caracteres —, roda o crivo (read-only) lote a lote e consolida um relatório que declara quantos arquivos entraram, quantos ficaram fora e por quê, com os achados ordenados por gravidade. Execução manual, sob pedido: NÃO gateia push, NÃO instala hook, NÃO conserta código. Use quando o usuário pedir /verificar, auditoria do repo, revisão do repositório inteiro, varredura de qualidade geral."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prefixo de caminho] [--lotes N] [--orcamento CHARS]"
---

# /verificar — auditoria manual do repositório inteiro

O gate do motor (`lib/runner/codefox-gate.ts`) só olha o **diff** da branch: `git diff --name-status`
mais o patch truncado em `GATE_DIFF_LIMIT`. Nada no hicode olha o **repositório inteiro**. Este skill
é essa varredura — e é **manual**.

## Limites duros (leia antes de qualquer coisa)

1. **Execução manual apenas.** Este skill roda quando **o usuário** digita `/verificar`. Não é
   automático, não tem cron, não tem heartbeat, não é chamado pelo motor.
2. **Não gateia push.** É **proibido** instalar hook de `pre-push`, registrar esta auditoria no
   `/pre-push`, ou propor gatear o push com ela. Se pedirem, recuse e explique: a regra da máquina
   do usuário é verificação manual; nenhum hook de push. O `/pre-push` continua sendo outra coisa
   (gate do diff que está saindo) e não é tocado aqui.
3. **Read-only no código.** A auditoria **lê e reporta**. Não edite arquivo do repo, não commite, não
   pushe, não abra/mergeie PR. Conserto é trabalho separado (card novo via `/new-card`, ou
   `limpio`/`rufus` depois, com o usuário decidindo).
4. **Honestidade de cobertura.** Auditoria que trunca em silêncio mente. Todo relatório declara
   **quantos arquivos entraram, quantos ficaram fora e por qual motivo** — os números vêm do plano,
   não da sua impressão.

## FASE 1 — Plano de auditoria (seleção determinística)

Quem seleciona e lotea é `lib/runner/auditoria.ts` (puro, testado em `test/auditoria.test.ts`):
lista com `git ls-files -z --cached --others --exclude-standard` (respeita `.gitignore`, nunca anda no
diretório, nunca pega `node_modules`), filtra por extensão de código (`ts/tsx/mts/cts/js/jsx/mjs/cjs/
vue/py` — config, IaC, docs, `.d.ts` e binário ficam fora **com motivo**), ordena por risco (monolito
>350 linhas, god-file ≥20 funções e <3 exports, arquivo sem teste correspondente; teste tem risco
reduzido para produção vir antes) e divide em lotes que **nunca** passam do orçamento de caracteres.

Argumentos (`$ARGUMENTS`, todos opcionais): um **prefixo de caminho** (recorte, ex.: `lib/runner/`),
`--lotes N` (teto de lotes desta execução) e `--orcamento CHARS` (default: `GATE_DIFF_LIMIT`, o mesmo
orçamento do gate). Sem argumentos = repositório inteiro, sem teto. Traduza `$ARGUMENTS` para `AUD_ESCOPO`/`AUD_LOTES`/
`AUD_ORCAMENTO` no comando abaixo — argumento que você não repassar simplesmente não vale.

O prefixo é comparado com `startsWith` cru (não é glob): `lib/runner/` recorta o diretório,
`lib/runner` também casaria `lib/runner-x.ts`. Se o recorte não casar com nada, o resumo emite
`ATENCAO: o recorte ... nao casou com nenhum arquivo` — nunca leia "0 de 0" como auditoria limpa.
Rode **da raiz do repo** (o `bun -e` importa por caminho relativo ao `cwd`):

```bash
cd "$(git rev-parse --show-toplevel)"
AUD_ESCOPO="" AUD_LOTES=0 AUD_ORCAMENTO=0 bun -e '
const a = await import(process.cwd() + "/lib/runner/auditoria.ts")
const p = await a.selecionarAuditoria({
  escopo: process.env.AUD_ESCOPO || "",
  maxLotes: Number(process.env.AUD_LOTES || 0),
  orcamentoChars: Number(process.env.AUD_ORCAMENTO || 0) || undefined,
})
console.log(a.resumoAuditoria(p))
for (const l of p.lotes) console.log("\n" + a.renderLote(l, p.lotes.length))
'
```

Guarde a saída (ex.: `/tmp/hicode-auditoria-plano.txt`) — ela é a **fonte dos números** do relatório
final. `resumoAuditoria` já emite a linha de cobertura e as linhas `fora (N): motivo — arquivos`;
`renderLote` emite, por lote, cada arquivo com linhas/funções/exports/risco e o **por quê** do risco.
Se o plano trouxe recorte (`escopo`), o resumo avisa que a cobertura vale só para o recorte — repita
esse aviso no relatório.

## FASE 2 — Combinar o gasto antes de gastar

Cada lote é **uma chamada de agente**. Diga ao usuário, em uma linha: quantos arquivos entraram,
quantos lotes, quantos ficaram fora, e **peça o OK** antes de rodar. Se o plano tem muitos lotes,
ofereça `--lotes N` (audita os N lotes de maior risco agora; o resto sai no relatório como
`acima-do-limite-de-lotes`, explicitamente **não auditado**) ou um recorte de caminho.

## FASE 3 — Revisão lote a lote

**Revisor default: `crivo`** (`.claude/agents/crivo.md`). Escolhido porque (a) é o revisor
adversarial de registro do hicode, com veredito **vinculante** — o mesmo papel que o gate do motor
usa; (b) suas tools são `Read, Glob, Grep`, ou seja é **read-only por carta**, o que uma varredura do
repo inteiro exige; (c) roda em `opus`, e auditoria sem diff depende de raciocínio, não de patch.

**Segundo passe condicional: `escudo`** (`.claude/agents/escudo.md`) — só nos lotes com sinal de
segurança (auth, sessão, token/segredo, rede, upload, subprocesso, SQL, dependências). Escudo é o
dono da postura de segurança, coisa que o crivo não especializa. **Atenção:** escudo tem `Write, Edit,
Bash` na carta — o prompt de delegação **precisa** dizer `REVISÃO SOMENTE — não modifique nenhum
arquivo`. Se não puder garantir isso, use só o crivo e registre a lacuna no relatório.

Não invente agente novo: o catálogo é `.claude/agents/`.

Para cada lote, delegue via Agent tool reaproveitando a **forma do prompt do gate** (não reescreva a
política — a fonte é `buildPrompt` em `lib/runner/codefox-gate.ts`):

- mesma linha de **PADRÕES**: tudo tipado strict, proibido `any`/`unknown`; arquivo ≤350 linhas e
  nunca god-file; sem comentário de prosa; Vue 3 Composition API (nunca React); erro nunca silenciado;
  merge sempre humano;
- diferença de escopo: em vez de `DIFF`, mande o bloco do `renderLote` e mande o agente **ler os
  arquivos do lote** (`Read`/`Grep`) — a auditoria é do estado atual do código, não de uma mudança;
- mesmo contrato de veredito, **uma linha de JSON**, acrescido dos achados:
  `{"verdict":"APPROVED|CONDITIONAL|BLOCKED","reason":"motivo curto","findings":[{"file":"...","line":12,"severity":"alta|media|baixa","what":"defeito concreto"}]}`
- mesma regra de calibragem do gate: `BLOCKED` só para defeito real/violação de alta confiança; em
  dúvida, `CONDITIONAL`. Achado sem evidência citável (arquivo:linha) é descartado, não "suspeita".

Para **parsear** o veredito, use `extractVerdictJson` de `lib/runner/codefox-gate.ts` — é o parser que
já existe (varre o texto e pega o último objeto JSON válido com `verdict`). Não escreva outro.

Narre o progresso (`[lote 2/5] 12 arquivos…`). Lote cujo agente falhou/estourou timeout **não conta
como auditado**: registre-o como não auditado no relatório, com o motivo (é a mesma disciplina do
gate, que trata veredito ausente como "não concluído", nunca como aprovado).

## FASE 4 — Consolidação

O relatório final, no terminal (e em `/tmp/` se o usuário quiser um arquivo — não crie `.md` de
relatório no repo), na ordem:

1. **Cobertura** — a linha do `resumoAuditoria` (`N de M arquivos em K lotes`), mais o recorte se
   houver, mais quantos lotes foram efetivamente revisados.
2. **O que ficou fora, por motivo** — os grupos de `foraPorMotivo` (`extensao-nao-auditavel`,
   `diretorio-gerado`, `arquivo-vazio`, `ilegivel`, `maior-que-o-lote`, `acima-do-limite-de-lotes`) com
   a contagem de cada um; `maior-que-o-lote` e `acima-do-limite-de-lotes` são **dívida de cobertura**:
   diga que esses arquivos não foram vistos por ninguém e como vê-los (`--orcamento` maior, recorte).
3. **Achados ordenados por gravidade** — junte os `findings` de todos os lotes e ordene com
   `ordenarAchados` de `lib/runner/auditoria.ts` (alta → média → baixa, depois arquivo e linha). Cada
   achado: `gravidade · arquivo:linha · defeito`, uma linha, sem prosa de enrolação.
4. **Dívida estrutural medida** — do próprio plano, sem IA: quantos arquivos passam de 350 linhas,
   quantos são god-file, quantos não têm teste correspondente (a heurística de teste é por **nome**;
   ela erra para mais — diga isso quando listar). Três ressalvas obrigatórias: (a) arquivo em
   `maior-que-o-lote` **não tem métrica calculada** — ele é grande por definição, então some-o à
   contagem de monolitos como "grande, não medido", nunca deixe de fora do número; (b) arquivo com a
   diretiva `hicode:allow-monolith` aparece como dívida **assumida** (o hook do repo não o bloqueia)
   e não conta como violação; (c) god-file só é medido onde `export` existe — módulo `.py` nunca é
   acusado de god-file.
5. **Veredito da auditoria** — o pior veredito entre os lotes (`BLOCKED` > `CONDITIONAL` > `APPROVED`)
   e, em uma frase, o que fazer primeiro.

## FASE 5 — Fechamento

Ofereça (sem executar por conta própria): abrir card para os achados de gravidade alta (`/new-card`),
ou chamar `limpio`/`rufus`/`testudo` para o item que o usuário escolher. Lembre que **nada** foi
alterado no repo por esta auditoria — e que ela **não** gateia push nem roda de novo sozinha.
