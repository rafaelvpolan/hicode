import { test, expect, afterAll, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-repos-'))
process.env.HICODE_REPOS_FILE = join(BASE, 'repos.json')

const { addRepo, removeRepo, repoStatus, detectBranch, isGitRepo } = await import('../lib/core/repos')

const NOW = '2026-08-13T00:00:00Z'
let seq = 0

afterAll(() => rmSync(BASE, { recursive: true, force: true }))
beforeEach(() => writeFileSync(join(BASE, 'repos.json'), '[]\n'))

function clone(opts: { git?: boolean; branch?: string } = {}): string {
  const dir = join(BASE, `alvo-${++seq}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `app-${seq}`, scripts: { build: 'vite build' }, dependencies: { vue: '^3' } }))
  if (opts.git !== false) {
    execFileSync('git', ['init', '-q', '.'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
    execFileSync('git', ['add', '-A'], { cwd: dir })
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
    execFileSync('git', ['branch', '-M', opts.branch ?? 'main'], { cwd: dir })
  }
  return dir
}

test('add registra, provisiona .hii/ e gera o contrato', () => {
  const dir = clone()
  const r = addRepo({ name: 'acme/app', path: dir }, NOW)
  expect(r.ok).toBe(true)
  expect(r.repo?.path).toBe(dir)
  expect(existsSync(join(dir, '.hii', 'config.json'))).toBe(true)
  expect(existsSync(join(dir, '.hii', 'contract.json'))).toBe(true)
  expect(r.contract?.stack).toContain('Vue 3')
})

test('add detecta a branch do proprio git quando nao informada', () => {
  const dir = clone({ branch: 'develop' })
  expect(addRepo({ name: 'acme/dev', path: dir }, NOW).repo?.branch).toBe('develop')
})

test('add respeita a branch informada', () => {
  expect(addRepo({ name: 'acme/x', path: clone(), branch: 'release' }, NOW).repo?.branch).toBe('release')
})

test('add recusa nome vazio', () => {
  expect(addRepo({ name: '  ', path: clone() }, NOW).error).toContain('owner/repo')
})

test('add recusa duplicado', () => {
  const dir = clone()
  addRepo({ name: 'acme/dup', path: dir }, NOW)
  const r = addRepo({ name: 'acme/dup', path: dir }, NOW)
  expect(r.ok).toBe(false)
  expect(r.error).toContain('ja esta registrado')
})

test('add recusa clone inexistente dizendo onde procurou', () => {
  const r = addRepo({ name: 'acme/fantasma', path: join(BASE, 'nao-existe') }, NOW)
  expect(r.ok).toBe(false)
  expect(r.error).toContain('clone nao encontrado')
  expect(r.error).toContain('nao-existe')
})

test('add recusa diretorio que nao e repositorio git', () => {
  const r = addRepo({ name: 'acme/naogit', path: clone({ git: false }) }, NOW)
  expect(r.ok).toBe(false)
  expect(r.error).toContain('nao e um repositorio git')
})

test('rm remove do registro sem tocar no clone', () => {
  const dir = clone()
  addRepo({ name: 'acme/rm', path: dir }, NOW)
  expect(removeRepo('acme/rm').ok).toBe(true)
  expect(repoStatus().some(r => r.name === 'acme/rm')).toBe(false)
  expect(existsSync(join(dir, 'package.json'))).toBe(true)
})

test('rm de repo inexistente devolve erro, nao lanca', () => {
  const r = removeRepo('acme/nunca-existiu')
  expect(r.ok).toBe(false)
  expect(r.error).toContain('nao esta registrado')
})

test('repoStatus marca clone ausente e contrato ausente', () => {
  const dir = clone()
  addRepo({ name: 'acme/ok', path: dir }, NOW)
  writeFileSync(join(BASE, 'repos.json'), JSON.stringify([
    { name: 'acme/ok', path: dir, branch: 'main', url: '', added: NOW },
    { name: 'acme/sumiu', path: join(BASE, 'foi-embora'), branch: 'main', url: '', added: NOW },
  ]))
  const st = Object.fromEntries(repoStatus().map(r => [r.name, r]))
  expect(st['acme/ok']?.cloneOk).toBe(true)
  expect(st['acme/ok']?.contractOk).toBe(true)
  expect(st['acme/sumiu']?.cloneOk).toBe(false)
  expect(st['acme/sumiu']?.gitOk).toBe(false)
})

test('isGitRepo e detectBranch nao lancam em caminho invalido', () => {
  expect(isGitRepo(join(BASE, 'nada'))).toBe(false)
  expect(detectBranch(join(BASE, 'nada'))).toBe('main')
})

test('doctor: clone ausente e erro com conserto acionavel', async () => {
  const { checkGitPush } = await import('../lib/core/doctor')
  const c = checkGitPush(join(BASE, 'nao-existe'), 'acme/x')
  expect(c.severidade).toBe('erro')
  expect(c.conserto).toContain('hii repo add')
})

test('doctor: contrato ausente e aviso, nao erro', async () => {
  const { checkContract } = await import('../lib/core/doctor')
  const c = checkContract(join(BASE, 'sem-contrato'))
  expect(c.severidade).toBe('aviso')
  expect(c.conserto).toContain('hii contract')
})

test('doctor: contrato sem build nem test avisa que os gates serao pulados', async () => {
  const { checkContract } = await import('../lib/core/doctor')
  const dir = clone()
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sem-scripts' }))
  const { syncContract } = await import('../lib/contract/store')
  syncContract(dir, NOW)
  const c = checkContract(dir)
  expect(c.severidade).toBe('aviso')
  expect(c.detalhe).toContain('sem build nem test')
})
