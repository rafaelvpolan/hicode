import { test, expect, afterAll } from 'bun:test'
import { getEventListeners } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-motor-eventos-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
const RUNS_DIR = join(process.env.HICODE_CARDS_DIR, 'runs')
mkdirSync(RUNS_DIR, { recursive: true })

const { createCard, updateCard } = await import('../panel/server/card')
const {
  novoEstado, lerNovosEventosDoLog, lerEventosDeRuns, lerNovoFim, lerNovaPausa, lerNovoVeredito,
  esperar, assinaturaMudou,
} = await import('../panel/server/motor/eventos')
import type { EventoDoMotor, MotivoDePausa } from '../panel/server/motor/types'
import type { CardStatus } from '../panel/shared/types'

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function tiposDe(eventos: EventoDoMotor[]): string[] {
  return eventos.map(e => e.tipo)
}

function escreverResumo(id: string, sufixo: string, steps: Record<string, { time: number; cost: number; tokens: number; costMeasured?: boolean }>): string {
  const nome = `${id}-${sufixo}.json`
  writeFileSync(join(RUNS_DIR, nome), JSON.stringify({ id, ts: '2026-01-01T00:00:00Z', ok: true, cost_usd: '0', steps }))
  return nome
}

function liveLogPath(id: string): string {
  return join(RUNS_DIR, `${id}.live.log`)
}

test('bug1: resumo reescrito no meio do pipeline nao emite fim e libera so os passos novos na proxima leitura', () => {
  const id = createCard({ title: 'x', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nx\n')
  escreverResumo(id, '20260101000000', { Executando: { time: 5, cost: 0.1, tokens: 10 } })
  const estado = novoEstado(id)

  const primeira = lerEventosDeRuns(id, estado)
  expect(tiposDe(primeira)).toEqual(['passo_iniciado', 'passo_concluido'])
  expect(tiposDe(primeira)).not.toContain('fim')

  escreverResumo(id, '20260101000000', {
    Executando: { time: 5, cost: 0.1, tokens: 10 },
    Arquitetura: { time: 3, cost: 0.05, tokens: 5 },
  })
  const segunda = lerEventosDeRuns(id, estado)
  expect(tiposDe(segunda)).toEqual(['passo_iniciado', 'passo_concluido'])
  const concluido = segunda.find(e => e.tipo === 'passo_concluido')
  expect(concluido && 'passo' in concluido ? concluido.passo : null).toBe('Arquitetura')

  const terceira = lerEventosDeRuns(id, estado)
  expect(terceira).toEqual([])
})

test('bug2: custo acumulado vem so do log ao vivo — o resumo em disco nunca gera evento de custo', () => {
  const id = createCard({ title: 'y', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\ny\n')
  escreverResumo(id, '20260101000000', { Executando: { time: 5, cost: 1.5, tokens: 10 } })
  const estado = novoEstado(id)

  const doResumo = lerEventosDeRuns(id, estado)
  expect(tiposDe(doResumo)).not.toContain('custo')
  expect(estado.custoAcumuladoUsd).toBe(0)

  writeFileSync(liveLogPath(id), '  → bash(ls)\n  ← ok\n— concluido (custo $0.3000) —\n')
  const doLog = lerNovosEventosDoLog(id, estado)
  const custos = doLog.filter(e => e.tipo === 'custo')
  expect(custos).toHaveLength(1)
  expect(estado.custoAcumuladoUsd).toBeCloseTo(0.3, 5)
})

test('bug3: poda do log ao vivo (encolheu) e tratada como poda — nao rebobina nem reconta custo', () => {
  const id = createCard({ title: 'z', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nz\n')
  const caminho = liveLogPath(id)
  const estado = novoEstado(id)

  writeFileSync(caminho, 'preambulo bem longo\n— concluido (custo $1.0000) —\n')
  const antes = lerNovosEventosDoLog(id, estado)
  expect(antes.filter(e => e.tipo === 'custo')).toHaveLength(1)
  expect(estado.custoAcumuladoUsd).toBeCloseTo(1, 5)

  writeFileSync(caminho, '— log podado —\n')
  const durantePoda = lerNovosEventosDoLog(id, estado)
  expect(durantePoda).toEqual([])
  expect(estado.custoAcumuladoUsd).toBeCloseTo(1, 5)

  writeFileSync(caminho, '— log podado —\n— concluido (custo $0.2000) —\n')
  const depoisDaPoda = lerNovosEventosDoLog(id, estado)
  expect(depoisDaPoda.filter(e => e.tipo === 'custo')).toHaveLength(1)
  expect(estado.custoAcumuladoUsd).toBeCloseTo(1.2, 5)
})

test('bug4: linha parcial no fim do log nao e processada nem perdida — so quando fecha com \\n', () => {
  const id = createCard({ title: 'w', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nw\n')
  const caminho = liveLogPath(id)
  const estado = novoEstado(id)

  writeFileSync(caminho, '— concl')
  const parcial = lerNovosEventosDoLog(id, estado)
  expect(parcial).toEqual([])
  expect(estado.offsetDoLog).toBe(0)

  writeFileSync(caminho, '— concl' + 'uido (custo $0.5000) —\n')
  const completa = lerNovosEventosDoLog(id, estado)
  expect(completa.filter(e => e.tipo === 'custo')).toHaveLength(1)
  expect(estado.custoAcumuladoUsd).toBeCloseTo(0.5, 5)
})

test('bug5: esperar() remove o listener de abort quando resolve por timeout — nao vaza listener', async () => {
  const controlador = new AbortController()
  const listenerFixo = (): void => {}
  controlador.signal.addEventListener('abort', listenerFixo)
  expect(getEventListeners(controlador.signal, 'abort')).toHaveLength(1)

  for (let i = 0; i < 5; i++) {
    await esperar(1, controlador.signal)
  }
  expect(getEventListeners(controlador.signal, 'abort')).toHaveLength(1)

  controlador.signal.removeEventListener('abort', listenerFixo)
})

test('bug6: fim so nasce de status TERMINAL de verdade (HALTED/PR_OPEN/MERGED/DEPLOYED), uma vez por transicao', () => {
  const id = createCard({ title: 'v', status: 'EXECUTING', repo: 'org/app', cost_usd: '2.5000' }, '## Objetivo\nv\n')
  escreverResumo(id, '20260101000000', { Executando: { time: 5, cost: 2.5, tokens: 10 } })
  const estado = novoEstado(id)

  expect(lerEventosDeRuns(id, estado).some(e => e.tipo === 'fim')).toBe(false)

  updateCard(id, { fields: { status: 'HALTED' } })
  const primeiroFim = lerNovoFim(id, estado)
  expect(primeiroFim).toHaveLength(1)
  const fim1 = primeiroFim[0]
  expect(fim1?.tipo).toBe('fim')
  if (fim1?.tipo === 'fim') {
    expect(fim1.resultado).toBe('falha')
    expect(fim1.custoUsd).toBeCloseTo(2.5, 5)
  }

  expect(lerNovoFim(id, estado)).toEqual([])

  updateCard(id, { fields: { status: 'EXECUTING' } })
  expect(lerNovoFim(id, estado)).toEqual([])

  updateCard(id, { fields: { status: 'PR_OPEN', cost_usd: '3.0000' } })
  const segundoFim = lerNovoFim(id, estado)
  expect(segundoFim).toHaveLength(1)
  const fim2 = segundoFim[0]
  if (fim2?.tipo === 'fim') {
    expect(fim2.resultado).toBe('sucesso')
    expect(fim2.custoUsd).toBeCloseTo(3, 5)
  }
})

test('rodada2: SPECCED e WAITING nao emitem fim nem pausa — sao trabalho enfileirado/auto-retomado, nao parada do motor', () => {
  const id = createCard({ title: 'q', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nq\n')
  const estado = novoEstado(id)
  lerNovoFim(id, estado)
  lerNovaPausa(id, estado)

  updateCard(id, { fields: { status: 'SPECCED' } })
  expect(lerNovoFim(id, estado)).toEqual([])
  expect(lerNovaPausa(id, estado)).toEqual([])

  updateCard(id, { fields: { status: 'EXECUTING' } })
  expect(lerNovoFim(id, estado)).toEqual([])
  expect(lerNovaPausa(id, estado)).toEqual([])

  updateCard(id, { fields: { status: 'WAITING' } })
  expect(lerNovoFim(id, estado)).toEqual([])
  expect(lerNovaPausa(id, estado)).toEqual([])

  updateCard(id, { fields: { status: 'EXECUTING' } })
  expect(lerNovoFim(id, estado)).toEqual([])
  expect(lerNovaPausa(id, estado)).toEqual([])
})

test('rodada2: URL, CLARIFY e PAUSED emitem pausa (nao fim) — motor parou, mas nao e sucesso nem falha', () => {
  const id = createCard({ title: 'p', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\np\n')
  const estado = novoEstado(id)
  lerNovoFim(id, estado)
  lerNovaPausa(id, estado)

  const casos: Array<{ status: CardStatus; motivo: MotivoDePausa }> = [
    { status: 'URL', motivo: 'aguardando_aprovacao_url' },
    { status: 'CLARIFY', motivo: 'pergunta_aberta' },
    { status: 'PAUSED', motivo: 'pausa_manual' },
  ]
  for (const { status, motivo: motivoEsperado } of casos) {
    updateCard(id, { fields: { status } })
    expect(lerNovoFim(id, estado)).toEqual([])
    const [pausa] = lerNovaPausa(id, estado)
    expect(pausa?.tipo).toBe('pausa')
    if (pausa?.tipo === 'pausa') {
      expect(pausa.motivo).toBe(motivoEsperado)
      expect(pausa.status).toBe(status)
    }
    updateCard(id, { fields: { status: 'EXECUTING' } })
    lerNovaPausa(id, estado)
  }
})

test('rodada2: pausa nao se repete enquanto o status pausado nao muda', () => {
  const id = createCard({ title: 'r', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nr\n')
  const estado = novoEstado(id)
  lerNovaPausa(id, estado)

  updateCard(id, { fields: { status: 'URL' } })
  expect(lerNovaPausa(id, estado)).toHaveLength(1)
  expect(lerNovaPausa(id, estado)).toEqual([])
  expect(lerNovaPausa(id, estado)).toEqual([])
})

test('rodada3: acumuladoUsd, na abertura da conexao, pula o log ja embutido em cost_usd — so soma o que vem depois', () => {
  const id = createCard({ title: 'c', status: 'EXECUTING', repo: 'org/app', cost_usd: '5.0000' }, '## Objetivo\nc\n')
  writeFileSync(liveLogPath(id), '— concluido (custo $2.0000) —\n')
  const estado = novoEstado(id)
  appendFileSync(liveLogPath(id), '— concluido (custo $0.3000) —\n')
  const eventos = lerNovosEventosDoLog(id, estado)
  const custos = eventos.filter(e => e.tipo === 'custo')
  expect(custos).toHaveLength(1)
  const custo = custos[0]
  if (custo?.tipo === 'custo') {
    expect(custo.usd).toBeCloseTo(0.3, 5)
    expect(custo.acumuladoUsd).toBeCloseTo(5.3, 5)
  }
})

test('rodada3: sem cost_usd no card, acumuladoUsd cai para a soma do log ao vivo (fallback)', () => {
  const id = createCard({ title: 'd', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nd\n')
  const estado = novoEstado(id)
  writeFileSync(liveLogPath(id), '— concluido (custo $0.4000) —\n')
  const eventos = lerNovosEventosDoLog(id, estado)
  const custo = eventos.find(e => e.tipo === 'custo')
  expect(custo?.tipo).toBe('custo')
  if (custo?.tipo === 'custo') expect(custo.acumuladoUsd).toBeCloseTo(0.4, 5)
})

test('rodada3: acumuladoUsd e monotonico mesmo quando o card salta na fronteira de fase', () => {
  const id = createCard({ title: 'e', status: 'EXECUTING', repo: 'org/app', cost_usd: '1.0000' }, '## Objetivo\ne\n')
  const estado = novoEstado(id)

  writeFileSync(liveLogPath(id), '— concluido (custo $0.2000) —\n')
  const primeiro = lerNovosEventosDoLog(id, estado).find(e => e.tipo === 'custo')
  if (primeiro?.tipo === 'custo') expect(primeiro.acumuladoUsd).toBeCloseTo(1.2, 5)

  updateCard(id, { fields: { cost_usd: '4.0000' } })
  writeFileSync(liveLogPath(id), '— concluido (custo $0.2000) —\n— concluido (custo $0.1000) —\n')
  const segundo = lerNovosEventosDoLog(id, estado).filter(e => e.tipo === 'custo')
  const ultimo = segundo[segundo.length - 1]
  if (ultimo?.tipo === 'custo') expect(ultimo.acumuladoUsd).toBeGreaterThanOrEqual(4)
  expect(estado.ultimoAcumuladoUsd).toBeGreaterThanOrEqual(4)
})

test('rodada3: status desconhecido (fora do vocabulario do motor) nao marca fim nem pausa, e nao derruba a leitura', () => {
  const id = createCard({ title: 'f', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nf\n')
  const estado = novoEstado(id)
  lerNovoFim(id, estado)
  lerNovaPausa(id, estado)

  updateCard(id, { fields: { status: 'BOGUS_STATUS_XYZ' } })
  expect(lerNovoFim(id, estado)).toEqual([])
  expect(lerNovaPausa(id, estado)).toEqual([])
})

test('rodada3: veredito do gate codefox e emitido como STRING (APPROVED|CONDITIONAL|BLOCKED), nao booleano', () => {
  const id = createCard({ title: 'g', status: 'URL', repo: 'org/app' }, '## Objetivo\ng\n')
  const estado = novoEstado(id)
  expect(lerNovoVeredito(id, estado)).toEqual([])

  updateCard(id, { fields: { review_verdict: 'APPROVED', review_reason: 'tudo certo' } })
  const [primeiro] = lerNovoVeredito(id, estado)
  expect(primeiro?.tipo).toBe('veredito')
  if (primeiro?.tipo === 'veredito') {
    expect(primeiro.veredito).toBe('APPROVED')
    expect(primeiro.motivo).toBe('tudo certo')
  }
  expect(lerNovoVeredito(id, estado)).toEqual([])

  updateCard(id, { fields: { review_verdict: 'CONDITIONAL', review_reason: 'revisar antes do merge' } })
  const [segundo] = lerNovoVeredito(id, estado)
  if (segundo?.tipo === 'veredito') expect(segundo.veredito).toBe('CONDITIONAL')

  updateCard(id, { fields: { review_verdict: 'BLOCKED', review_reason: 'faltou teste' } })
  const [terceiro] = lerNovoVeredito(id, estado)
  if (terceiro?.tipo === 'veredito') expect(terceiro.veredito).toBe('BLOCKED')
})

test('rodada3: passo_concluido carrega custoMedido — nao devolve so um numero mudo quando o provedor nao mede custo', () => {
  const id = createCard({ title: 'k', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nk\n')
  escreverResumo(id, '20260101000000', {
    Executando: { time: 5, cost: 0.5, tokens: 10, costMeasured: true },
    Testes: { time: 3, cost: 0, tokens: 0, costMeasured: false },
  })
  const estado = novoEstado(id)
  const eventos = lerEventosDeRuns(id, estado).filter((e): e is Extract<EventoDoMotor, { tipo: 'passo_concluido' }> => e.tipo === 'passo_concluido')
  const executando = eventos.find(e => e.passo === 'Executando')
  const testes = eventos.find(e => e.passo === 'Testes')
  expect(executando?.custoMedido).toBe(true)
  expect(testes?.custoMedido).toBe(false)
})

test('rodada7: cardId sem padding e normalizado como qualquer outro leitor do painel (padStart 3)', () => {
  const id = createCard({ title: 'h', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nh\n')
  const semPadding = String(Number(id))
  const estado = novoEstado(semPadding)
  writeFileSync(liveLogPath(id), '— concluido (custo $0.1000) —\n')
  const eventos = lerNovosEventosDoLog(semPadding, estado)
  expect(eventos.filter(e => e.tipo === 'custo')).toHaveLength(1)
})

test('rodada-costura: passo com custo zero e tempo zero (gate codefox sem diff, ou provedor local gratis) nao desaparece do stream', () => {
  const id = createCard({ title: 'costura', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\ncostura\n')
  escreverResumo(id, '20260101000000', {
    Executando: { time: 5, cost: 0.1, tokens: 10 },
    Codefox: { time: 0, cost: 0, tokens: 0, costMeasured: true },
  })
  const estado = novoEstado(id)
  const eventos = lerEventosDeRuns(id, estado)
  const passos = eventos.filter((e): e is Extract<EventoDoMotor, { tipo: 'passo_concluido' }> => e.tipo === 'passo_concluido').map(e => e.passo)
  expect(passos).toContain('Codefox')
  expect(passos).toContain('Executando')
})

test('rodada-costura2: os 9 passos pre-declarados zerados pelo execute (initialSteps) nao aparecem no stream — so o finish, gravando valor real no MESMO arquivo, os libera', () => {
  const id = createCard({ title: 'costura2', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\ncostura2\n')
  const estado = novoEstado(id)

  const placeholdersDoExecute = {
    Fila: { time: 0, cost: 0, tokens: 0 },
    Executando: { time: 5, cost: 0.1, tokens: 10 },
    Feito: { time: 1, cost: 0, tokens: 0 },
    Url: { time: 2, cost: 0, tokens: 0 },
    Aprovado: { time: 0, cost: 0, tokens: 0 },
    Arquitetura: { time: 0, cost: 0, tokens: 0 },
    Testes: { time: 0, cost: 0, tokens: 0 },
    Seguranca: { time: 0, cost: 0, tokens: 0 },
    Review: { time: 0, cost: 0, tokens: 0 },
    Limpeza: { time: 0, cost: 0, tokens: 0 },
    Reajuste: { time: 0, cost: 0, tokens: 0 },
    Revalidacao: { time: 0, cost: 0, tokens: 0 },
  }
  const nome = escreverResumo(id, '20260101000100', placeholdersDoExecute)

  const doExecute = lerEventosDeRuns(id, estado)
  const passosDoExecute = doExecute.filter((e): e is Extract<EventoDoMotor, { tipo: 'passo_concluido' }> => e.tipo === 'passo_concluido').map(e => e.passo)
  expect(passosDoExecute.sort()).toEqual(['Executando', 'Feito', 'Url'])

  writeFileSync(join(RUNS_DIR, nome), JSON.stringify({
    id,
    ts: '2026-01-01T00:01:00Z',
    ok: true,
    cost_usd: '0',
    steps: {
      ...placeholdersDoExecute,
      Arquitetura: { time: 3, cost: 0.05, tokens: 5, costMeasured: true },
      Testes: { time: 8, cost: 0.2, tokens: 20, costMeasured: true },
    },
  }))

  const doFinish = lerEventosDeRuns(id, estado)
  const passosDoFinish = doFinish.filter((e): e is Extract<EventoDoMotor, { tipo: 'passo_concluido' }> => e.tipo === 'passo_concluido').map(e => e.passo)
  expect(passosDoFinish.sort()).toEqual(['Arquitetura', 'Testes'])

  const semNovaMudanca = lerEventosDeRuns(id, estado)
  expect(semNovaMudanca).toEqual([])
})

test('rodada7: assinatura de arquivo (mtime+size) so muda quando o conteudo muda — evita reler run intacto a cada tick', () => {
  const caminho = join(RUNS_DIR, 'assinatura-teste.json')
  writeFileSync(caminho, '{"a":1}')
  const primeira = assinaturaMudou(caminho, undefined)
  expect(primeira).not.toBeNull()

  const segunda = assinaturaMudou(caminho, primeira ?? undefined)
  expect(segunda).toBeNull()

  writeFileSync(caminho, '{"a":22}')
  const terceira = assinaturaMudou(caminho, primeira ?? undefined)
  expect(terceira).not.toBeNull()
})
