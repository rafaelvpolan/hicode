import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { probeContract, commandsFor, packageForPath } from '../lib/contract/probe'
import { syncContract, readContract } from '../lib/contract/store'

interface FixturePkg {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[]
}

const feitos: string[] = []
const NOW = '2026-08-13T00:00:00Z'

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), 'hicode-probe-'))
  feitos.push(d)
  return d
}

function pkg(dir: string, content: FixturePkg): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content))
}

afterAll(() => { for (const d of feitos) rmSync(d, { recursive: true, force: true }) })

test('projeto unico: detecta gerenciador pelo lockfile e comandos pelos scripts', () => {
  const r = repo()
  pkg(r, { name: 'app', scripts: { build: 'vite build', test: 'vitest', dev: 'vite' }, dependencies: { vue: '^3', vite: '^5' } })
  writeFileSync(join(r, 'pnpm-lock.yaml'), '')
  const c = probeContract(r, NOW)
  expect(c.shape).toBe('single')
  expect(c.packageManager).toBe('pnpm')
  expect(c.commands.build).toBe('pnpm run build')
  expect(c.commands.test).toBe('pnpm run test')
  expect(c.stack).toContain('Vue 3')
  expect(c.stack).toContain('Vite')
})

test('script ausente vira comando vazio, nao um chute', () => {
  const r = repo()
  pkg(r, { name: 'app', scripts: { build: 'tsc' } })
  const c = probeContract(r, NOW)
  expect(c.commands.build).toBe('npm run build')
  expect(c.commands.test).toBe('')
  expect(c.commands.dev).toBe('')
})

test('workspaces: pacotes do glob viram filtros do gerenciador', () => {
  const r = repo()
  pkg(r, { name: 'raiz', workspaces: ['packages/*'], scripts: { build: 'turbo build' } })
  writeFileSync(join(r, 'pnpm-lock.yaml'), '')
  writeFileSync(join(r, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n')
  pkg(join(r, 'packages', 'web'), { name: '@app/web', scripts: { build: 'vite build' }, dependencies: { vue: '^3' } })
  pkg(join(r, 'packages', 'api'), { name: '@app/api', scripts: { build: 'tsc' }, dependencies: { '@nestjs/core': '^10' } })
  const c = probeContract(r, NOW)
  expect(c.shape).toBe('workspaces')
  expect(c.monorepo).toBe(true)
  expect(c.packages.map(p => p.path)).toContain('packages/web')
  expect(c.commands.build).toContain('--filter')
})

test('poli-repo: sem package.json na raiz, varre os projetos irmaos', () => {
  const r = repo()
  pkg(join(r, 'front'), { name: 'front', scripts: { dev: 'vite --port 3005' }, dependencies: { react: '^19' } })
  pkg(join(r, 'api'), { name: 'api', scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10' } })
  const c = probeContract(r, NOW)
  expect(c.shape).toBe('poly')
  expect(c.monorepo).toBe(true)
  expect(c.packages.length).toBe(2)
})

test('poli-repo: cada projeto mantem SEU gerenciador', () => {
  const r = repo()
  pkg(join(r, 'a'), { name: 'a', scripts: { build: 'x' } })
  writeFileSync(join(r, 'a', 'pnpm-lock.yaml'), '')
  pkg(join(r, 'b'), { name: 'b', scripts: { build: 'y' } })
  writeFileSync(join(r, 'b', 'yarn.lock'), '')
  const c = probeContract(r, NOW)
  const byPath = Object.fromEntries(c.packages.map(p => [p.path, p.packageManager]))
  expect(byPath.a).toBe('pnpm')
  expect(byPath.b).toBe('yarn')
  expect(c.packages.find(p => p.path === 'b')?.commands.build).toBe('yarn run build')
})

test('poli-repo ignora node_modules, docs e infra', () => {
  const r = repo()
  pkg(join(r, 'node_modules', 'lib'), { name: 'lib' })
  pkg(join(r, 'docs'), { name: 'docs' })
  pkg(join(r, 'app'), { name: 'app', scripts: { build: 'x' } })
  expect(probeContract(r, NOW).packages.map(p => p.path)).toEqual(['app'])
})

test('porta de dev sai do config e do script', () => {
  const r = repo()
  pkg(join(r, 'a'), { name: 'a', scripts: { dev: 'next dev -p 3004' } })
  pkg(join(r, 'b'), { name: 'b', scripts: { dev: 'vite' } })
  writeFileSync(join(r, 'b', 'vite.config.ts'), 'export default { server: { port: 5199 } }')
  const c = probeContract(r, NOW)
  const byPath = Object.fromEntries(c.packages.map(p => [p.path, p.devPort]))
  expect(byPath.a).toBe(3004)
  expect(byPath.b).toBe(5199)
})

test('repo vazio nao explode e declara que nao detectou', () => {
  const c = probeContract(repo(), NOW)
  expect(c.packages.length).toBe(0)
  expect(c.stack).toContain('nao detectado')
})

test('hash muda quando o package.json muda, e so entao', () => {
  const r = repo()
  pkg(r, { name: 'app', scripts: { build: 'x' } })
  const a = probeContract(r, NOW).hash
  expect(probeContract(r, '2027-01-01T00:00:00Z').hash).toBe(a)
  pkg(r, { name: 'app', scripts: { build: 'x', test: 'y' } })
  expect(probeContract(r, NOW).hash).not.toBe(a)
})

test('syncContract grava e nao reescreve quando nada mudou', () => {
  const r = repo()
  pkg(r, { name: 'app', scripts: { build: 'x' } })
  const first = syncContract(r, NOW)
  expect(first.changed).toBe(true)
  expect(readContract(r)?.stack).toBe(first.contract.stack)
  expect(syncContract(r, NOW).changed).toBe(false)
})

test('packageForPath resolve o pacote afetado pelo caminho mais especifico', () => {
  const r = repo()
  pkg(r, { name: 'raiz', workspaces: ['apps', 'apps/*'] })
  pkg(join(r, 'apps'), { name: 'apps', scripts: { build: 'y' } })
  pkg(join(r, 'apps', 'web'), { name: 'web', scripts: { build: 'x' } })
  const c = probeContract(r, NOW)
  expect(packageForPath(c, 'apps/web/src/App.vue')?.name).toBe('web')
  expect(packageForPath(c, 'apps/tsconfig.json')?.name).toBe('apps')
})

test('varredura poli e depth-1 por desenho: nao desce em subpacote', () => {
  const r = repo()
  pkg(join(r, 'apps'), { name: 'apps', scripts: { build: 'y' } })
  pkg(join(r, 'apps', 'web'), { name: 'web', scripts: { build: 'x' } })
  expect(probeContract(r, NOW).packages.map(p => p.path)).toEqual(['apps'])
})

test('commandsFor monta o filtro certo por gerenciador', () => {
  expect(commandsFor('pnpm', ['build'], '@app/web').build).toBe('pnpm --filter @app/web run build')
  expect(commandsFor('yarn', ['build'], 'web').build).toBe('yarn workspace web run build')
  expect(commandsFor('npm', ['build'], 'web').build).toBe('npm -w web run build')
  expect(commandsFor('npm', ['build']).build).toBe('npm run build')
})
