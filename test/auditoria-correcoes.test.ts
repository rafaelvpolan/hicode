import { test, expect, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { numeroDeEnv } from '../lib/runner/config'
import { disponibilidadeExterna } from '../lib/ai/mcp-estado'
import type { ConsultaMcp, ServidorMcp } from '../lib/ai/mcp-estado'
import { syncWithBase } from '../lib/runner/finish-sync'
import { runCodefoxGate } from '../lib/runner/codefox-gate'

const criados: string[] = []
function dirTemp(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo))
  criados.push(d)
  return d
}

afterEach(() => {
  delete process.env.HICODE_TESTE_NUM
  for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true })
})

function repoGit(): string {
  const d = dirTemp('hicode-aud-git-')
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: d })
  execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: d })
  execFileSync('git', ['config', 'user.name', 'teste'], { cwd: d })
  writeFileSync(join(d, 'a.txt'), 'inicial\n')
  execFileSync('git', ['add', '-A'], { cwd: d })
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'inicial'], { cwd: d })
  return d
}

test('REGRESSAO o gate vinculante falha FECHADO quando o git nao roda — antes aprovava', async () => {
  const wt = repoGit()
  const g = await runCodefoxGate(wt, 'base-que-nao-existe', 'objetivo qualquer', '')
  expect(g.verdict).not.toBe('APPROVED')
  expect(g.ok).toBe(false)
  expect(g.reason).toContain('nao consegui LER o diff')
})

function repoComConflitoReal(): string {
  const wt = repoGit()
  const git = (...args: string[]): void => { execFileSync('git', args, { cwd: wt }) }
  git('checkout', '-q', '-b', 'trabalho')
  writeFileSync(join(wt, 'a.txt'), 'versao do card\n')
  git('add', '-A')
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'card')
  git('checkout', '-q', 'main')
  writeFileSync(join(wt, 'a.txt'), 'versao da base\n')
  git('add', '-A')
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'base')
  git('checkout', '-q', 'trabalho')
  try { git('merge', 'main') } catch { void 0 }
  return wt
}

const passoQueDizQueResolveu = async (): Promise<{ ok: boolean; text: string; cost: number; tokens: number; costMeasured: boolean; time: number }> =>
  ({ ok: true, text: 'resolvi', cost: 0, tokens: 0, costMeasured: true, time: 0 })

test('REGRESSAO agente que NAO tirou os marcadores nao faz o conflito passar como resolvido', async () => {
  const wt = repoComConflitoReal()
  const r = await syncWithBase('999', wt, 'main', 'objetivo', {}, passoQueDizQueResolveu as unknown as typeof import('../lib/runner/agent').runStep)
  expect(r.ok).toBe(false)
})

test('REGRESSAO agente que NAO executou nao faz o conflito passar como resolvido', async () => {
  const wt = repoComConflitoReal()
  const naoExecutou = async (): Promise<{ ok: boolean; text: string; cost: number; tokens: number; costMeasured: boolean; time: number }> =>
    ({ ok: false, text: 'provider nao-agentico — step NAO executou', cost: 0, tokens: 0, costMeasured: true, time: 0 })
  const r = await syncWithBase('998', wt, 'main', 'objetivo', {}, naoExecutou as unknown as typeof import('../lib/runner/agent').runStep)
  expect(r.ok).toBe(false)
})

test('REGRESSAO env numerico invalido nao vira NaN em silencio', () => {
  process.env.HICODE_TESTE_NUM = 'auto'
  expect(numeroDeEnv('HICODE_TESTE_NUM', 3)).toBe(3)
  process.env.HICODE_TESTE_NUM = '-5'
  expect(numeroDeEnv('HICODE_TESTE_NUM', 3)).toBe(3)
  process.env.HICODE_TESTE_NUM = '8'
  expect(numeroDeEnv('HICODE_TESTE_NUM', 3)).toBe(8)
  delete process.env.HICODE_TESTE_NUM
  expect(numeroDeEnv('HICODE_TESTE_NUM', 3)).toBe(3)
})

const consulta = (servidores: ServidorMcp[], escopos: Record<string, 'dinamico' | 'persistente' | 'nao-verificavel'>): ConsultaMcp => ({
  servidores: async () => servidores,
  escopo: async (nome) => escopos[nome] ?? 'persistente',
  prefixo: (nome) => `mcp__${nome.replace(/[^a-zA-Z0-9]+/g, '_')}`,
})

test('REGRESSAO conector cujo escopo NAO deu para verificar e tratado como indisponivel', async () => {
  const r = await disponibilidadeExterna('notion',
    consulta([{ nome: 'notion', estado: 'conectado' }], { notion: 'nao-verificavel' }))
  expect(r.usavel).toBe(false)
  expect(r.motivo).toContain('nao consegui verificar')
  expect(r.motivo).not.toContain('sessao interativa')
  expect(r.tools).toEqual([])
})

test('escopo dinamico continua com o motivo proprio, diferente de nao-verificavel', async () => {
  const r = await disponibilidadeExterna('notion',
    consulta([{ nome: 'notion', estado: 'conectado' }], { notion: 'dinamico' }))
  expect(r.usavel).toBe(false)
  expect(r.motivo).toContain('sessao interativa')
})
