import { test, expect, afterAll } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ClarifyQuestion } from '../panel/shared/types'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-card-clarify-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')

const { readClarify, writeClarify } = await import('../panel/server/card/clarify')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

test('readClarify devolve lista vazia quando o arquivo ainda nao existe', () => {
  expect(readClarify('501')).toEqual([])
})

test('writeClarify cria o diretorio runs/ sob demanda, e readClarify le de volta o mesmo conteudo', () => {
  const perguntas: ClarifyQuestion[] = [{ q: 'qual caminho?', options: ['a', 'b'], recommended: 'a' }]
  writeClarify('502', perguntas)
  expect(existsSync(join(process.env.HICODE_CARDS_DIR ?? '', 'runs'))).toBe(true)
  expect(readClarify('502')).toEqual(perguntas)
})

test('readClarify devolve lista vazia quando o arquivo tem JSON invalido, sem lancar', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '503.clarify.json'), '{ nao e json valido')
  expect(readClarify('503')).toEqual([])
})

test('readClarify devolve lista vazia quando o JSON e valido mas nao e um array', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '504.clarify.json'), JSON.stringify({ nao: 'um array' }))
  expect(readClarify('504')).toEqual([])
})

test('writeClarify sobrescreve o arquivo anterior por completo, nao mescla', () => {
  writeClarify('505', [{ q: 'primeira', options: [], recommended: '' }])
  writeClarify('505', [{ q: 'segunda', options: [], recommended: '' }])
  const lidas = readClarify('505')
  expect(lidas).toHaveLength(1)
  expect(lidas[0]?.q).toBe('segunda')
})
