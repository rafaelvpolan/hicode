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

function moraNesteRepo(variavel: { lado: string }): boolean {
  const temPainel = existsSync(join(ROOT, 'bin', 'repl.ts'))
  if (variavel.lado === 'ambos') return true
  return variavel.lado === 'painel' ? temPainel : !temPainel || existsSync(join(ROOT, 'runner.ts'))
}

test('todo resolvedor do lado DESTE repo existe de verdade — o do outro lado nao e cobrado aqui', () => {
  for (const variavel of CONTRATO_MOTOR_PAINEL) {
    if (!moraNesteRepo(variavel)) continue
    for (const caminho of variavel.resolvidoPor) {
      expect(existsSync(join(ROOT, caminho)), `${variavel.nome} → ${caminho}`).toBe(true)
    }
  }
})

test('toda variavel do contrato declara de que lado ela vive', () => {
  for (const v of CONTRATO_MOTOR_PAINEL) {
    expect(['motor', 'painel', 'ambos'], v.nome).toContain(v.lado)
  }
})

function constanteEsperada(nomeDaVariavel: string): string {
  return `ENV_${nomeDaVariavel.replace(/^HICODE_/, '')}`
}

test('todo arquivo resolvedor referencia de fato a variavel — pelo nome literal ou pela constante do contrato, nao so declara e some', () => {
  for (const variavel of CONTRATO_MOTOR_PAINEL) {
    if (!moraNesteRepo(variavel)) continue
    const constante = constanteEsperada(variavel.nome)
    for (const caminho of variavel.resolvidoPor) {
      const conteudo = readFileSync(join(ROOT, caminho), 'utf8')
      expect(conteudo.includes(variavel.nome) || conteudo.includes(constante), `${variavel.nome} → ${caminho}`).toBe(true)
    }
  }
})

test('HICODE_ROOT nao entra no rol das que precisam do mesmo caminho absoluto nos dois clones — cada clone tem a sua', () => {
  const raiz = CONTRATO_MOTOR_PAINEL.find(v => v.nome === ENV_ROOT)
  expect(raiz?.precisaSerCompartilhadaEntreClones).toBe(false)
})

test('variavel de um lado so NAO pode ser marcada como compartilhada entre clones', () => {
  for (const v of CONTRATO_MOTOR_PAINEL) {
    if (v.lado === 'ambos') continue
    expect(v.precisaSerCompartilhadaEntreClones, `${v.nome} e do lado "${v.lado}" e nao precisa ser compartilhada`).toBe(false)
  }
})
