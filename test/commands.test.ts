import { test, expect } from 'bun:test'
import { splitCommand, affectedPackage, resolveCommand, devCommand, devCwd, hasCommand } from '../lib/runner/commands'
import { commandsFor } from '../lib/contract/probe'
import type { Contract, PackageInfo, PackageManager, RepoShape } from '../lib/contract/types'

function pkg(path: string, name: string, pm: PackageManager, scripts: string[], framework = '', workspaceName = ''): PackageInfo {
  return {
    name, path, framework, language: 'TypeScript', packageManager: pm,
    scripts, devPort: 0, commands: commandsFor(pm, scripts, workspaceName),
  }
}

function contract(shape: RepoShape, packages: PackageInfo[], main = ''): Contract {
  const principal = packages.find(p => p.path === main) ?? packages[0]
  return {
    version: 1, generated: '', hash: '', shape,
    packageManager: principal?.packageManager ?? 'npm',
    monorepo: shape !== 'single', main,
    packages, stack: 'x',
    commands: principal?.commands ?? commandsFor('npm', []),
    sources: [],
  }
}

test('splitCommand separa binario e argumentos', () => {
  expect(splitCommand('pnpm --filter web run build')).toEqual({ cmd: 'pnpm', args: ['--filter', 'web', 'run', 'build'] })
  expect(splitCommand('   npm run test  ')).toEqual({ cmd: 'npm', args: ['run', 'test'] })
})

test('splitCommand devolve null para comando vazio', () => {
  expect(splitCommand('')).toBeNull()
  expect(splitCommand('   ')).toBeNull()
})

test('projeto unico: roda na raiz do worktree', () => {
  const c = contract('single', [pkg('', 'app', 'pnpm', ['build'])])
  const r = resolveCommand(c, 'build', '/wt')
  expect(r?.cmd).toBe('pnpm')
  expect(r?.cwd).toBe('/wt')
  expect(r?.label).toBe('pnpm run build')
})

test('script ausente devolve null — gate pulado em vez de comando chutado', () => {
  const c = contract('single', [pkg('', 'app', 'npm', ['build'])])
  expect(resolveCommand(c, 'test', '/wt')).toBeNull()
})

test('poli-repo: roda DENTRO do pacote afetado', () => {
  const c = contract('poly', [pkg('front', 'front', 'pnpm', ['build']), pkg('api', 'api', 'yarn', ['build'])])
  const front = c.packages[0]
  const api = c.packages[1]
  expect(resolveCommand(c, 'build', '/wt', front)?.cwd).toBe('/wt/front')
  expect(resolveCommand(c, 'build', '/wt', api)?.cwd).toBe('/wt/api')
})

test('poli-repo: cada pacote usa o SEU gerenciador', () => {
  const c = contract('poly', [pkg('front', 'front', 'pnpm', ['build']), pkg('api', 'api', 'yarn', ['build'])])
  expect(resolveCommand(c, 'build', '/wt', c.packages[0])?.cmd).toBe('pnpm')
  expect(resolveCommand(c, 'build', '/wt', c.packages[1])?.cmd).toBe('yarn')
})

test('workspaces: roda na raiz com filtro, nao dentro do pacote', () => {
  const c = contract('workspaces', [
    pkg('', 'raiz', 'pnpm', ['build']),
    pkg('packages/web', '@app/web', 'pnpm', ['build'], '', '@app/web'),
  ])
  const web = c.packages[1]
  const r = resolveCommand(c, 'build', '/wt', web)
  expect(r?.cwd).toBe('/wt')
  expect(r?.args).toContain('--filter')
})

test('affectedPackage resolve quando o diff toca um pacote so', () => {
  const c = contract('poly', [pkg('front', 'front', 'npm', ['build']), pkg('api', 'api', 'npm', ['build'])])
  expect(affectedPackage(c, ['front/src/a.ts', 'front/src/b.ts'])?.name).toBe('front')
})

test('affectedPackage devolve undefined quando o diff cruza pacotes', () => {
  const c = contract('poly', [pkg('front', 'front', 'npm', ['build']), pkg('api', 'api', 'npm', ['build'])])
  expect(affectedPackage(c, ['front/src/a.ts', 'api/src/b.ts'])).toBeUndefined()
})

test('affectedPackage devolve undefined quando nada bate', () => {
  const c = contract('poly', [pkg('front', 'front', 'npm', ['build'])])
  expect(affectedPackage(c, ['README.md'])).toBeUndefined()
})

test('sem pacote afetado, cai no principal do contrato', () => {
  const c = contract('poly', [pkg('front', 'front', 'pnpm', ['build']), pkg('api', 'api', 'yarn', ['build'])], 'api')
  expect(resolveCommand(c, 'build', '/wt')?.cwd).toBe('/wt/api')
})

test('devCommand usa a flag de porta do framework', () => {
  const next = contract('single', [pkg('', 'app', 'pnpm', ['dev'], 'Next.js')])
  expect(devCommand(next, 3004)?.args).toEqual(['run', 'dev', '-p', '3004'])
  const vite = contract('single', [pkg('', 'app', 'pnpm', ['dev'], 'Vue 3')])
  expect(devCommand(vite, 5200)?.args).toEqual(['run', 'dev', '--port', '5200'])
})

test('devCommand com npm insere o -- antes das flags', () => {
  const c = contract('single', [pkg('', 'app', 'npm', ['dev'], 'Vue 3')])
  expect(devCommand(c, 5200)?.args).toEqual(['run', 'dev', '--', '--port', '5200'])
})

test('devCommand devolve null quando o alvo nao tem dev', () => {
  expect(devCommand(contract('single', [pkg('', 'app', 'npm', ['build'])]), 5200)).toBeNull()
})

test('devCwd entra no pacote so em poli-repo', () => {
  const poly = contract('poly', [pkg('front', 'front', 'npm', ['dev'])])
  expect(devCwd(poly, '/wt')).toBe('/wt/front')
  const ws = contract('workspaces', [pkg('', 'raiz', 'npm', ['dev'])])
  expect(devCwd(ws, '/wt')).toBe('/wt')
})

test('hasCommand olha a raiz e tambem os pacotes', () => {
  expect(hasCommand(null, 'dev')).toBe(false)
  expect(hasCommand(contract('single', [pkg('', 'app', 'npm', ['build'])]), 'dev')).toBe(false)
  expect(hasCommand(contract('poly', [pkg('a', 'a', 'npm', ['build']), pkg('b', 'b', 'npm', ['dev'])]), 'dev')).toBe(true)
})
