import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-actions-'))
process.env.HICODE_CARDS_DIR = CARDS

const A = await import('../lib/core/actions')
const { readCard } = await import('../lib/runner/card-store')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function novo(over: Partial<Parameters<typeof A.submit>[0]> = {}): string {
  return A.submit({ title: 'tarefa', repo: 'org/app', desc: 'fazer algo', ...over })
}

test('submit cria card READY com objetivo no corpo', () => {
  const id = novo({ title: 'FAQ na home', desc: 'acordeao acessivel' })
  const c = readCard(id)
  expect(c?.fm.status).toBe('READY')
  expect(c?.fm.title).toBe('FAQ na home')
  expect(c?.body).toContain('acordeao acessivel')
})

test('submit sem desc usa o titulo como objetivo', () => {
  const c = readCard(A.submit({ title: 'so titulo', repo: 'org/app' }))
  expect(c?.body).toContain('## Objetivo\nso titulo')
})

test('submit grava as flags de ativacao humana quando vem preenchidas', () => {
  const c = readCard(novo({ layout: 'on', pilha: 'on', ai: 'claude', effort: 'max' }))
  expect(c?.fm.layout).toBe('on')
  expect(c?.fm.pilha).toBe('on')
  expect(c?.fm.effort).toBe('max')
})

test('submit omite flags vazias em vez de gravar string vazia', () => {
  const c = readCard(novo())
  expect(c?.fm.layout).toBeUndefined()
  expect(c?.fm.ai).toBeUndefined()
})

test('transition registra origem e destino no log', () => {
  const id = novo()
  A.transition(id, 'EXECUTING', 'manual')
  const c = readCard(id)
  expect(c?.fm.status).toBe('EXECUTING')
  expect(c?.body).toContain('READY->EXECUTING manual')
})

test('resumeFrom volta a PREVIEW_OK marcando o passo', () => {
  const id = novo()
  A.transition(id, 'HALTED')
  const r = A.resumeFrom(id, 'Testes')
  expect(r?.status).toBe('PREVIEW_OK')
  expect(readCard(id)?.fm.resume_from).toBe('Testes')
  expect(readCard(id)?.body).toContain('HALTED->PREVIEW_OK replay a partir de Testes')
})

test('approvePreview leva a PREVIEW_OK', () => {
  const id = novo()
  A.transition(id, 'PREVIEW')
  expect(A.approvePreview(id)?.status).toBe('PREVIEW_OK')
})

test('requestCorrection exige status PREVIEW', () => {
  const id = novo()
  expect(A.requestCorrection(id, 'src/a.vue', 'ajuste')).toBeNull()
})

test('requestCorrection exige worktree valido', () => {
  const id = novo()
  A.transition(id, 'PREVIEW')
  expect(A.requestCorrection(id, 'src/a.vue', 'ajuste')).toBeNull()
})

test('requestCorrection grava ancora e instrucao quando o worktree existe', () => {
  const wt = join(CARDS, 'wt-fake')
  mkdirSync(join(wt, '.git'), { recursive: true })
  const id = novo()
  A.transition(id, 'PREVIEW')
  const { patchCard } = require('../lib/runner/card-store') as typeof import('../lib/runner/card-store')
  patchCard(id, { worktree: wt })
  const r = A.requestCorrection(id, 'src/a.vue', 'tirar o negrito', '42', 'texto\nquebrado')
  expect(r?.status).toBe('CORRECTING')
  expect(r?.correction_file).toBe('src/a.vue')
  expect(r?.correction_line_text).toBe('texto quebrado')
  expect(readCard(id)?.body).toContain('src/a.vue:42')
})

test('answerClarify grava resposta, marca clarified e volta a EXECUTING', () => {
  const id = novo()
  const dir = join(CARDS, 'runs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.clarify.json`), JSON.stringify([{ q: 'um por vez?', options: ['sim', 'nao'], recommended: 'sim' }]))
  A.transition(id, 'CLARIFY')
  const r = A.answerClarify(id, [{ q: 'um por vez?', answer: 'nao' }])
  expect(r?.status).toBe('EXECUTING')
  expect(r?.clarified).toBe('true')
  const { readClarify } = require('../lib/runner/clarify') as typeof import('../lib/runner/clarify')
  expect(readClarify(id)[0]?.answer).toBe('nao')
})

test('answerClarify sem perguntas gravadas e no-op', () => {
  expect(A.answerClarify(novo(), [{ q: 'x', answer: 'y' }])).toBeNull()
})

test('edit troca o objetivo preservando o log', () => {
  const id = novo({ desc: 'objetivo velho' })
  A.transition(id, 'READY', 'marco')
  A.edit(id, { desc: 'objetivo novo' })
  const c = readCard(id)
  expect(c?.body).toContain('objetivo novo')
  expect(c?.body).not.toContain('objetivo velho')
  expect(c?.body).toContain('marco')
})

test('edit em card EXECUTING auto-pausa', () => {
  const id = novo()
  A.transition(id, 'EXECUTING')
  expect(A.edit(id, { title: 'outro' })?.status).toBe('PAUSED')
})

test('edit em card parado nao muda o status', () => {
  const id = novo()
  A.transition(id, 'HALTED')
  expect(A.edit(id, { title: 'outro' })?.status).toBe('HALTED')
})

test('remove apaga o card e devolve false na segunda vez', () => {
  const id = novo()
  expect(A.remove(id)).toBe(true)
  expect(readCard(id)).toBeNull()
  expect(A.remove(id)).toBe(false)
})

test('acao em card inexistente devolve null, nunca lanca', () => {
  expect(A.transition('777', 'HALTED')).toBeNull()
  expect(A.edit('777', { title: 'x' })).toBeNull()
  expect(A.resumeFrom('777', 'Testes')).toBeNull()
  expect(A.setPreviewPid('777', 1)).toBeNull()
})
