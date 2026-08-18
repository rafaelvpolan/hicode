import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { handle, newSession, COMMANDS, ALIASES, canonico } from '../lib/core/session'
import type { EffectKind } from '../lib/core/session'

const raiz = join(import.meta.dir, '..')
const fonteDispatch = readFileSync(join(raiz, 'lib/core/dispatch.ts'), 'utf8')
const fonteSession = readFileSync(join(raiz, 'lib/core/session.ts'), 'utf8')

function casesDoSwitch(fonte: string): string[] {
  return [...fonte.matchAll(/^ {4}case '([^']+)':/gm)].map(m => m[1] ?? '')
}

test('nenhum case duplicado no dispatch — o segundo seria codigo morto', () => {
  const cases = casesDoSwitch(fonteDispatch)
  const vistos = new Set<string>()
  const duplicados = cases.filter(c => (vistos.has(c) ? true : (vistos.add(c), false)))
  expect(duplicados).toEqual([])
})

test('nenhum EffectKind repetido na uniao — TypeScript deduplica em silencio', () => {
  const bloco = fonteSession.match(/export type EffectKind =([\s\S]*?)\n\n/)?.[1] ?? ''
  const nomes = [...bloco.matchAll(/'([^']+)'/g)].map(m => m[1] ?? '')
  expect(nomes.length).toBeGreaterThan(20)
  expect(nomes.length).toBe(new Set(nomes).size)
})

test('todo efeito que o parser produz tem um case que o trate', () => {
  const produzidos = new Set([...fonteSession.matchAll(/kind: '([^']+)'/g)].map(m => m[1] ?? ''))
  const tratados = new Set(casesDoSwitch(fonteDispatch))
  const foraDoDispatch = new Set(['quit', 'board', 'none'])
  const orfaos = [...produzidos].filter(k => !tratados.has(k) && !foraDoDispatch.has(k))
  expect(orfaos).toEqual([])
})

test('nenhum case do dispatch fica orfao — case que ninguem alcanca e codigo morto', () => {
  const doParser = [...fonteSession.matchAll(/kind: '([^']+)'/g)].map(m => m[1] ?? '')
  const doProprioDispatch = [...fonteDispatch.matchAll(/kind: '([^']+)'/g)].map(m => m[1] ?? '')
  const alcancaveis = new Set([...doParser, ...doProprioDispatch])
  expect(alcancaveis.size).toBeGreaterThan(10)
  const orfaos = casesDoSwitch(fonteDispatch).filter(c => !alcancaveis.has(c))
  expect(orfaos).toEqual([])
})

test('nenhum comando canonico e apelido de outro — foi assim que /halt, /quit e /project viraram duplicata', () => {
  for (const cmd of COMMANDS) expect(canonico(cmd), cmd).toBe(cmd)
})

test('nenhum apelido serve a dois comandos, e apelido nao repete o principal', () => {
  const vistos = new Set<string>()
  for (const [principal, apelidos] of Object.entries(ALIASES)) {
    for (const a of apelidos) {
      expect(vistos.has(a), `${a} aparece em mais de um comando`).toBe(false)
      expect(a, `${a} e apelido de si mesmo`).not.toBe(principal)
      vistos.add(a)
    }
  }
  expect(vistos.size).toBeGreaterThan(0)
})

test('/ask e /new-ask sao efeitos DISTINTOS — colidiram e quebraram o /ask', () => {
  const responder = handle('/ask 022 sim, pode seguir', newSession('org/app'))
  const perguntar = handle('/new-ask tem ntn-cli instalada?', newSession('org/app'))
  expect(responder.effect.kind).toBe('ask')
  expect(perguntar.effect.kind).toBe('consultar')
  expect(responder.effect.kind).not.toBe(perguntar.effect.kind)
})

test('/ask sem argumento continua abrindo a pergunta pendente do card', () => {
  expect(handle('/ask', newSession('org/app')).effect.kind).toBe('ask')
})

test('todo comando anunciado no /help e no autocompletar existe no parser', () => {
  const semAcao: EffectKind[] = ['error']
  for (const cmd of COMMANDS) {
    const r = handle(`${cmd} 001 x`, newSession('org/app'))
    expect(semAcao).not.toContain(r.effect.kind)
  }
})

test('todo apelido resolve para um comando anunciado', () => {
  for (const [principal, apelidos] of Object.entries(ALIASES)) {
    expect([...COMMANDS] as string[]).toContain(principal)
    for (const a of apelidos) expect(canonico(a)).toBe(principal)
  }
})

test('comando desconhecido avisa em vez de sumir', () => {
  const r = handle('/xpto', newSession('org/app'))
  expect(r.effect.kind).toBe('error')
  expect(r.effect.text).toContain('desconhecido')
})
