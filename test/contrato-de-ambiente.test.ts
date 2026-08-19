import { test, expect } from 'bun:test'
import { CONTRATO_MOTOR_PAINEL } from '../lib/runner/environment-contract'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

test('REGRESSAO todo estado compartilhado por ARQUIVO esta no contrato de ambiente', () => {
  const declaradas = new Set(CONTRATO_MOTOR_PAINEL.map(v => v.nome))
  const fora: string[] = []
  const varrer = (dir: string): void => {
    for (const it of readdirSync(dir, { withFileTypes: true })) {
      if (it.name === 'node_modules') continue
      const caminho = join(dir, it.name)
      if (it.isDirectory()) { varrer(caminho); continue }
      if (!it.name.endsWith('.ts')) continue
      const fonte = readFileSync(caminho, 'utf8')
      for (const m of fonte.matchAll(/process\.env\.(HICODE_[A-Z_]*(?:FILE|DIR|PIDFILE|LOCK))\b/g)) {
        const nome = m[1] ?? ''
        if (nome && !declaradas.has(nome)) fora.push(`${caminho}: ${nome}`)
      }
    }
  }
  varrer('lib')
  expect(fora, 'variavel que aponta para arquivo/dir compartilhado e nao esta no contrato entre os repos').toEqual([])
})
