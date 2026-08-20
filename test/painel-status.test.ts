import { test, expect, afterAll } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CardStatus } from '../panel/shared/types'
import {
  STATUSES, STATUS_URL_APROVADA, STATUS_URL_PENDENTE, aguardaAprovacaoDeUrl, estaEncerrado,
  paraCardStatus, podeReexecutarEtapa, statusCanonicoOuNulo, statusDoMotor, temUrlViva, urlAprovada,
} from '../panel/shared/status'
import { hiiHome } from '../panel/server/motor/ambiente'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-status-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(join(process.env.HICODE_CARDS_DIR, 'runs'), { recursive: true })

const WORKTREE = join(BASE, 'worktree')
mkdirSync(join(WORKTREE, '.git'), { recursive: true })

const { createCard, readCard } = await import('../panel/server/card')
const { resumeFrom } = await import('../panel/server/card/acoes')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function cardEm(status: CardStatus, comWorktree = true): string {
  return createCard({
    slug: `s-${status.toLowerCase()}`,
    title: `card ${status}`,
    status,
    risk: 'low',
    repo: 'org/app',
    created: new Date().toISOString(),
    ...(comWorktree ? { worktree: WORKTREE } : {}),
  }, '## Objetivo\nx\n\n## Log de Estado\n')
}

function statusDe(id: string): string {
  return readCard(id)?.fm.status ?? ''
}

test('STATUSES cobre a uniao inteira de CardStatus', () => {
  const todosOsMembros: Record<CardStatus, true> = {
    INBOX: true, READY: true, CLARIFY: true, SPECCED: true, PLAN_APPROVED: true, EXECUTING: true,
    PAUSED: true, WAITING: true, EXECUTED: true, PREVIEW: true, URL: true, CORRECTING: true,
    PREVIEW_OK: true, URL_OK: true, REFINED: true, TESTS_GREEN: true, SEC_CLEARED: true,
    REVIEWED: true, CLEANED: true, PR_OPEN: true, MERGED: true, DEPLOYED: true, HALTED: true,
  }
  const membrosDoLiteral = Object.keys(todosOsMembros) as CardStatus[]
  expect(new Set(STATUSES)).toEqual(new Set(membrosDoLiteral))
})

test('paraCardStatus aceita o alias legado e cai para INBOX no desconhecido', () => {
  expect(paraCardStatus('PREVIEW')).toBe('PREVIEW')
  expect(paraCardStatus('URL')).toBe('URL')
  expect(paraCardStatus('nao-existe')).toBe('INBOX')
  expect(paraCardStatus(undefined)).toBe('INBOX')
})

test('statusDoMotor traduz o par legado e e identidade no resto', () => {
  expect(statusDoMotor('PREVIEW')).toBe('URL')
  expect(statusDoMotor('PREVIEW_OK')).toBe('URL_OK')
  for (const s of STATUSES) {
    if (s === 'PREVIEW' || s === 'PREVIEW_OK') continue
    expect(statusDoMotor(s)).toBe(s)
  }
})

test('statusCanonicoOuNulo devolve o status do motor ou null — nunca INBOX de consolo', () => {
  expect(statusCanonicoOuNulo('PREVIEW')).toBe('URL')
  expect(statusCanonicoOuNulo('MERGED')).toBe('MERGED')
  expect(statusCanonicoOuNulo('nao-existe')).toBeNull()
  expect(statusCanonicoOuNulo(undefined)).toBeNull()
})

test('as perguntas de url enxergam o alias legado', () => {
  expect(aguardaAprovacaoDeUrl('PREVIEW')).toBe(true)
  expect(aguardaAprovacaoDeUrl(STATUS_URL_PENDENTE)).toBe(true)
  expect(aguardaAprovacaoDeUrl('URL_OK')).toBe(false)
  expect(urlAprovada('PREVIEW_OK')).toBe(true)
  expect(temUrlViva('PREVIEW')).toBe(true)
})

test('podeReexecutarEtapa recusa card encerrado e aceita card em polimento', () => {
  for (const s of ['PR_OPEN', 'MERGED', 'DEPLOYED'] as CardStatus[]) {
    expect(podeReexecutarEtapa(s), `${s} nao pode voltar a rodar`).toBe(false)
    expect(estaEncerrado(s)).toBe(true)
  }
  for (const s of ['INBOX', 'READY', 'EXECUTING', 'URL', 'PREVIEW', 'CLARIFY'] as CardStatus[]) {
    expect(podeReexecutarEtapa(s), `${s} ainda nao chegou no polimento`).toBe(false)
  }
  for (const s of ['URL_OK', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'HALTED'] as CardStatus[]) {
    expect(podeReexecutarEtapa(s), `${s} pode repetir um passo`).toBe(true)
  }
})

test('resumeFrom grava o mesmo status que pending() consome como finish', () => {
  const id = cardEm('REFINED')
  expect(resumeFrom(id, 'Testes')).not.toBeNull()
  expect(statusDe(id)).toBe(STATUS_URL_APROVADA)
  expect(STATUS_URL_APROVADA).toBe('URL_OK')
  expect(readCard(id)?.fm.resume_from).toBe('Testes')
})

test('REGRESSAO resumeFrom recusa card encerrado — clique em MERGED nao vira job finish', () => {
  const id = cardEm('MERGED')
  expect(resumeFrom(id, 'Testes')).toBeNull()
  expect(statusDe(id)).toBe('MERGED')
})

test('REGRESSAO resumeFrom recusa card sem worktree — o motor pararia em HALTED', () => {
  const id = cardEm('CLEANED', false)
  expect(resumeFrom(id, 'Limpeza')).toBeNull()
  expect(statusDe(id)).toBe('CLEANED')
})

function fielAoContratoDeFinish(textoDaFila: string, status: string): boolean {
  return textoDaFila.includes(`porStatus('${status}').map(c => ({ kind: 'finish'`)
}

const RODAR_CONTRATO_HII = process.env.HICODE_CONTRATO_HII === '1'
const testeDeContratoHii = RODAR_CONTRATO_HII ? test : test.skip

testeDeContratoHii('CONTRATO o status gravado por resumeFrom e o que a fila do hii mapeia para finish (HICODE_CONTRATO_HII=1)', () => {
  const fonte = join(hiiHome(), 'lib', 'runner', 'queue-state.ts')
  expect(existsSync(fonte), `queue-state.ts nao encontrado em ${fonte} — HICODE_CONTRATO_HII=1 exige o clone do hii ao lado (ou HII_HOME apontando para ele); este teste e o unico guardiao da costura entre os dois repos e nao pode passar em silencio sem checar nada`).toBe(true)
  const texto = readFileSync(fonte, 'utf8')
  expect(fielAoContratoDeFinish(texto, STATUS_URL_APROVADA), 'a fila do hii nao mapeia mais este status para finish').toBe(true)
})

test('fielAoContratoDeFinish detecta divergencia — uma fixture com o status errado nao passa', () => {
  const fixtureDivergente = `porStatus('URL_APROVADO_ERRADO').map(c => ({ kind: 'finish', id: c.id ?? '' }))`
  expect(fielAoContratoDeFinish(fixtureDivergente, STATUS_URL_APROVADA)).toBe(false)
})
