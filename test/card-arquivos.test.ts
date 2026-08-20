import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-card-arquivos-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

const { cardFiles, normalizeId, findCardFile, createCard, readCard, updateCard } = await import('../panel/server/card')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

test('normalizeId preenche com zero a esquerda um id numerico puro (padStart 3)', () => {
  expect(normalizeId('7')).toBe('007')
  expect(normalizeId('42')).toBe('042')
  expect(normalizeId('123')).toBe('123')
})

test('normalizeId deixa passar sem alteracao um id que nao e so digitos', () => {
  expect(normalizeId('abc')).toBe('abc')
  expect(normalizeId('')).toBe('')
})

test('cardFiles devolve lista vazia quando o diretorio de cards ainda nao existe', () => {
  const semDiretorio = join(tmpdir(), 'hicode-card-arquivos-inexistente-' + Date.now())
  const anterior = process.env.HICODE_CARDS_DIR
  process.env.HICODE_CARDS_DIR = semDiretorio
  try {
    expect(cardFiles()).toEqual([])
  } finally {
    process.env.HICODE_CARDS_DIR = anterior
  }
})

test('cardFiles lista so arquivos .md, ignorando lixo e subpastas no mesmo diretorio', () => {
  writeFileSync(join(process.env.HICODE_CARDS_DIR ?? '', '900-teste-listagem.md'), 'x')
  writeFileSync(join(process.env.HICODE_CARDS_DIR ?? '', '901-nao-e-card.txt'), 'x')
  mkdirSync(join(process.env.HICODE_CARDS_DIR ?? '', 'runs'), { recursive: true })
  const arquivos = cardFiles()
  expect(arquivos).toContain('900-teste-listagem.md')
  expect(arquivos.some(f => f.endsWith('.txt'))).toBe(false)
  expect(arquivos).not.toContain('runs')
})

test('findCardFile casa pelo prefixo "id-", nao encontra id que e apenas prefixo textual de outro', () => {
  writeFileSync(join(process.env.HICODE_CARDS_DIR ?? '', '910-um-slug.md'), 'x')
  writeFileSync(join(process.env.HICODE_CARDS_DIR ?? '', '9100-outro-slug.md'), 'x')
  expect(findCardFile('910')).toBe('910-um-slug.md')
  expect(findCardFile('9100')).toBe('9100-outro-slug.md')
})

test('findCardFile devolve null quando nenhum arquivo comeca com o id pedido', () => {
  expect(findCardFile('999999')).toBeNull()
})

test('createCard, depois readCard, devolve os mesmos campos e o mesmo corpo (round-trip real em disco)', () => {
  const id = createCard({ title: 'Tarefa X', status: 'READY', repo: 'org/app', slug: 'tarefa-x' }, '## Objetivo\nfazer X\n')
  const card = readCard(id)
  expect(card).not.toBeNull()
  expect(card?.fm.title).toBe('Tarefa X')
  expect(card?.fm.status).toBe('READY')
  expect(card?.fm.repo).toBe('org/app')
  expect(card?.body.trim()).toBe('## Objetivo\nfazer X')
  expect(card?.file).toBe(`${id}-tarefa-x.md`)
})

test('createCard atribui ids crescentes, um a mais que o maior id ja existente', () => {
  const primeiro = createCard({ title: 'a', status: 'READY', repo: 'org/app', slug: 'a' }, '## Objetivo\na\n')
  const segundo = createCard({ title: 'b', status: 'READY', repo: 'org/app', slug: 'b' }, '## Objetivo\nb\n')
  expect(Number(segundo)).toBe(Number(primeiro) + 1)
})

test('updateCard com fields como funcao recebe os campos ANTES do patch, nao os novos', () => {
  const id = createCard({ title: 'c', status: 'READY', repo: 'org/app', slug: 'c' }, '## Objetivo\nc\n')
  const resultado = updateCard(id, { fields: before => ({ status: 'EXECUTING', status_anterior: before.status ?? '' }) })
  expect(resultado?.status).toBe('EXECUTING')
  expect(resultado?.status_anterior).toBe('READY')
})

test('updateCard com log como funcao recebe os campos ANTES do patch e a linha entra no corpo', () => {
  const id = createCard({ title: 'd', status: 'READY', repo: 'org/app', slug: 'd' }, '## Objetivo\nd\n')
  updateCard(id, { fields: { status: 'EXECUTING' }, log: before => `${before.status}->EXECUTING` })
  const card = readCard(id)
  expect(card?.body).toContain('READY->EXECUTING')
})

test('updateCard com body como funcao transforma o corpo preservando os campos', () => {
  const id = createCard({ title: 'e', status: 'READY', repo: 'org/app', slug: 'e' }, '## Objetivo\ne\n')
  updateCard(id, { body: corpo => corpo.replace('e', 'objetivo editado') })
  const card = readCard(id)
  expect(card?.body).toContain('objetivo editado')
  expect(card?.fm.title).toBe('e')
})

test('updateCard acrescenta ao "order" uma chave nova que nao existia no frontmatter original', () => {
  const id = createCard({ title: 'f', status: 'READY', repo: 'org/app', slug: 'f' }, '## Objetivo\nf\n')
  const antes = readCard(id)
  expect(antes?.order.includes('worktree')).toBe(false)
  updateCard(id, { fields: { worktree: '/tmp/algum-worktree' } })
  const depois = readCard(id)
  expect(depois?.order.includes('worktree')).toBe(true)
  expect(depois?.fm.worktree).toBe('/tmp/algum-worktree')
})

test('updateCard sempre atualiza o campo "updated" mesmo quando nenhum outro campo muda', () => {
  const id = createCard({ title: 'g', status: 'READY', repo: 'org/app', slug: 'g' }, '## Objetivo\ng\n')
  const antes = readCard(id)?.fm.updated
  updateCard(id, { log: 'apenas uma anotacao' })
  const depois = readCard(id)?.fm.updated
  expect(depois).toBeTruthy()
  expect(typeof depois).toBe('string')
  expect(antes).toBeTruthy()
})

test('updateCard e readCard devolvem null para um id que nao corresponde a nenhum arquivo', () => {
  expect(readCard('777777')).toBeNull()
  expect(updateCard('777777', { fields: { status: 'EXECUTING' } })).toBeNull()
})
