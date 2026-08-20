import { test, expect } from 'bun:test'
import { splitFrontMatter, serializeCard } from '../panel/server/card/frontmatter'
import { appendLog, extractObjetivo, setObjetivo, tituloDe } from '../panel/server/card/texto'
import { isoNow, slugify } from '../panel/server/card/util'
import type { Fields } from '../panel/server/card/tipos'

test('round-trip: serializeCard seguido de splitFrontMatter devolve os mesmos campos, ordem e corpo', () => {
  const fm: Fields = { id: '001', status: 'READY', title: 'Uma Tarefa' }
  const order = ['id', 'status', 'title']
  const body = 'corpo da tarefa\nsegunda linha\n'
  const texto = serializeCard(fm, order, body)
  const parsed = splitFrontMatter(texto)
  expect(parsed.fm).toEqual(fm)
  expect(parsed.order).toEqual(order)
  expect(parsed.body.trim()).toBe(body.trim())
})

test('splitFrontMatter sem delimitadores --- devolve fm vazio e o texto inteiro como corpo', () => {
  const texto = 'so um texto qualquer, sem frontmatter'
  const parsed = splitFrontMatter(texto)
  expect(parsed.fm).toEqual({})
  expect(parsed.order).toEqual([])
  expect(parsed.body).toBe(texto)
})

test('splitFrontMatter ignora linha do bloco sem dois-pontos, sem quebrar as demais', () => {
  const texto = '---\nid: 001\nlinha sem separador\nstatus: READY\n---\ncorpo\n'
  const parsed = splitFrontMatter(texto)
  expect(parsed.fm).toEqual({ id: '001', status: 'READY' })
  expect(parsed.order).toEqual(['id', 'status'])
})

test('serializeCard cai para Object.keys(fm) quando order vem vazio', () => {
  const fm: Fields = { b: '2', a: '1' }
  const texto = serializeCard(fm, [], 'corpo\n')
  const parsed = splitFrontMatter(texto)
  expect(parsed.order).toEqual(['b', 'a'])
})

test('serializeCard colapsa quebra de linha embutida no valor de um campo — frontmatter nao e multi-linha', () => {
  const texto = serializeCard({ title: 'linha um\nlinha dois' }, ['title'], 'x\n')
  const parsed = splitFrontMatter(texto)
  expect(parsed.fm.title).toBe('linha um linha dois')
})

test('slugify normaliza acentos, minusculas, separa por hifen e cai em "tarefa" quando vazio', () => {
  expect(slugify('Ação Rápida')).toBe('acao-rapida')
  expect(slugify('')).toBe('tarefa')
  expect(slugify('   ')).toBe('tarefa')
  expect(slugify('Já! Fez?')).toBe('ja-fez')
})

test('slugify trunca em 40 caracteres sem deixar hifen pendurado na ponta', () => {
  const longo = 'Ação Rápida de Deploy em Producao com Muitas Palavras Extras'
  const slug = slugify(longo)
  expect(slug.length).toBeLessThanOrEqual(40)
  expect(slug.endsWith('-')).toBe(false)
})

test('isoNow produz um timestamp ISO sem fracao de segundo (formato usado no log do card)', () => {
  expect(isoNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
})

test('extractObjetivo le o conteudo entre "## Objetivo" e o proximo cabecalho', () => {
  const body = '## Objetivo\nfazer X\n\n## Log de Estado\nlinha1'
  expect(extractObjetivo(body)).toBe('fazer X')
})

test('extractObjetivo devolve vazio quando o corpo nao tem secao Objetivo', () => {
  expect(extractObjetivo('so um corpo qualquer\nsem cabecalhos')).toBe('')
})

test('setObjetivo substitui o conteudo de uma secao Objetivo ja existente', () => {
  const body = '## Objetivo\nfazer X\n\n## Log de Estado\nlinha1'
  const atualizado = setObjetivo(body, 'novo objetivo')
  expect(extractObjetivo(atualizado)).toBe('novo objetivo')
  expect(atualizado).toContain('## Log de Estado\nlinha1')
})

test('setObjetivo cria a secao Objetivo no topo quando o corpo ainda nao tem uma', () => {
  const body = 'so um corpo qualquer\nsem cabecalhos'
  const atualizado = setObjetivo(body, 'meu objetivo')
  expect(atualizado.startsWith('## Objetivo\nmeu objetivo\n\n')).toBe(true)
  expect(atualizado).toContain('so um corpo qualquer\nsem cabecalhos')
})

test('appendLog cria a secao "## Log de Estado" quando o corpo ainda nao tem uma', () => {
  const body = 'so um corpo qualquer\nsem cabecalhos'
  const atualizado = appendLog(body, 'primeira linha')
  expect(atualizado).toBe('so um corpo qualquer\nsem cabecalhos\n\n## Log de Estado\nprimeira linha')
})

test('appendLog acrescenta a linha ao final quando a secao ja existe, sem duplicar o marcador', () => {
  const body = '## Objetivo\nx\n\n## Log de Estado\nlinha1'
  const atualizado = appendLog(body, 'linha2')
  expect(atualizado).toBe('## Objetivo\nx\n\n## Log de Estado\nlinha1\nlinha2')
  expect(atualizado.match(/## Log de Estado/g)).toHaveLength(1)
})

test('tituloDe pega a primeira linha nao vazia e colapsa espacos internos', () => {
  expect(tituloDe('\n\n  fazer   algo   \nsegunda linha')).toBe('fazer algo')
})

test('tituloDe trunca titulo longo em 120 caracteres com reticencias', () => {
  const longo = 'x'.repeat(150)
  const titulo = tituloDe(longo)
  expect(titulo.length).toBe(120)
  expect(titulo.endsWith('…')).toBe(true)
})

test('tituloDe devolve vazio para texto vazio ou so com linhas em branco', () => {
  expect(tituloDe('')).toBe('')
  expect(tituloDe('\n\n   \n')).toBe('')
})
