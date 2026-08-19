import { test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib/runner/config'
import {
  CONTRATO_MOTOR_PAINEL,
  ENV_AGENTS_DIR,
  ENV_CARDS_DIR,
  ENV_REPOS_FILE,
  ENV_ROOT,
  ENV_RUNNER_LOCK,
  ENV_RUNNER_LOG,
  ENV_RUNNER_PIDFILE,
} from '../lib/runner/environment-contract'

test('as constantes do contrato batem com os nomes de variavel documentados', () => {
  expect(ENV_ROOT).toBe('HICODE_ROOT')
  expect(ENV_CARDS_DIR).toBe('HICODE_CARDS_DIR')
  expect(ENV_REPOS_FILE).toBe('HICODE_REPOS_FILE')
  expect(ENV_AGENTS_DIR).toBe('HICODE_AGENTS_DIR')
  expect(ENV_RUNNER_PIDFILE).toBe('HICODE_RUNNER_PIDFILE')
  expect(ENV_RUNNER_LOCK).toBe('HICODE_RUNNER_LOCK')
  expect(ENV_RUNNER_LOG).toBe('HICODE_RUNNER_LOG')
})

test('nenhuma variavel do contrato se repete', () => {
  const nomes = CONTRATO_MOTOR_PAINEL.map(v => v.nome)
  expect(new Set(nomes).size).toBe(nomes.length)
})

test('todo arquivo listado como resolvedor de uma variavel existe de verdade no repo', () => {
  for (const variavel of CONTRATO_MOTOR_PAINEL) {
    for (const caminho of variavel.resolvidoPor) {
      expect(existsSync(join(ROOT, caminho))).toBe(true)
    }
  }
})

function constanteEsperada(nomeDaVariavel: string): string {
  return `ENV_${nomeDaVariavel.replace(/^HICODE_/, '')}`
}

test('todo arquivo resolvedor referencia de fato a variavel — pelo nome literal ou pela constante do contrato, nao so declara e some', () => {
  for (const variavel of CONTRATO_MOTOR_PAINEL) {
    const constante = constanteEsperada(variavel.nome)
    for (const caminho of variavel.resolvidoPor) {
      const conteudo = readFileSync(join(ROOT, caminho), 'utf8')
      expect(conteudo.includes(variavel.nome) || conteudo.includes(constante)).toBe(true)
    }
  }
})

test('HICODE_ROOT nao entra no rol das que precisam do mesmo caminho absoluto nos dois clones — cada clone tem a sua', () => {
  const raiz = CONTRATO_MOTOR_PAINEL.find(v => v.nome === ENV_ROOT)
  expect(raiz?.precisaSerCompartilhadaEntreClones).toBe(false)
})
