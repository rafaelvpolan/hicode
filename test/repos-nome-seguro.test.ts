import { test, expect } from 'bun:test'
import { nomeSeguro, branchSegura } from '../panel/server/utils/repos'

test('aceita formato owner/repo', () => {
  expect(nomeSeguro('rafaelvpolan/hicode-site')).toBe(true)
})

test('aceita nome simples sem barra', () => {
  expect(nomeSeguro('cashbarber2')).toBe(true)
})

test('aceita caminho com varios segmentos e barra final (formato multi-path com trailing slash)', () => {
  expect(nomeSeguro('projects/podium/cashbarber2/')).toBe(true)
})

test('rejeita travessia de diretorio', () => {
  expect(nomeSeguro('../etc/passwd')).toBe(false)
  expect(nomeSeguro('projects/../etc')).toBe(false)
})

test('rejeita caminho absoluto', () => {
  expect(nomeSeguro('/etc/passwd')).toBe(false)
})

test('rejeita caracteres fora do conjunto seguro', () => {
  expect(nomeSeguro('repo; rm -rf /')).toBe(false)
  expect(nomeSeguro('repo\ttab')).toBe(false)
})

test('branchSegura aceita branches reais em uso', () => {
  expect(branchSegura('main')).toBe(true)
  expect(branchSegura('master')).toBe(true)
  expect(branchSegura('feat/visual-e-paleta')).toBe(true)
})

test('branchSegura rejeita travessia e flags', () => {
  expect(branchSegura('../main')).toBe(false)
  expect(branchSegura('--upload-pack=touch /tmp/pwned')).toBe(false)
})
