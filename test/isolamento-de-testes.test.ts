import { test, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dir)

function arquivosDeTeste(): string[] {
  return readdirSync(DIR).filter(f => f.endsWith('.test.ts'))
}

const ESCREVEM = /createCard|patchCard|updateCard|core\.submit|instruir\(|answerClarify|remover\(|removerLote|dispatch\(/
const ISOLAM = /HICODE_CARDS_DIR/

test('REGRESSAO todo teste que escreve card isola HICODE_CARDS_DIR', () => {
  const culpados: string[] = []
  for (const nome of arquivosDeTeste()) {
    const fonte = readFileSync(join(DIR, nome), 'utf8')
    if (ESCREVEM.test(fonte) && !ISOLAM.test(fonte)) culpados.push(nome)
  }
  expect(culpados, 'escrevem card sem isolar o diretorio — vazam para cards/ de verdade').toEqual([])
})

test('REGRESSAO teste que le variavel de terminal fixa o valor que testa', () => {
  const culpados: string[] = []
  for (const nome of arquivosDeTeste()) {
    const fonte = readFileSync(join(DIR, nome), 'utf8')
    const usaLink = /\blink\(|linkificar\(/.test(fonte)
    if (usaLink && !/HICODE_HYPERLINKS/.test(fonte)) culpados.push(nome)
  }
  expect(culpados, 'dependem do terminal de quem roda — verdes local, vermelhos na CI').toEqual([])
})

test('REGRESSAO nenhum teste aponta para o config real do repo', () => {
  const culpados: string[] = []
  for (const nome of arquivosDeTeste()) {
    const fonte = readFileSync(join(DIR, nome), 'utf8')
    if (/config\/(repos|ia|modelos)\.json/.test(fonte) && !/tmpdir|mkdtemp/.test(fonte)) culpados.push(nome)
  }
  expect(culpados, 'mexem no config local do usuario').toEqual([])
})
