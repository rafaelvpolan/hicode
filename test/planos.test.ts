import { test, expect, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { janelasDe, modelosDoKimi, nomeDoTier, planoDoClaude, planoDoKimi, provedorDoKimi } from '../lib/ai/planos'
import { sondarOllama } from '../lib/ai/ollama-estado'

const dir = mkdtempSync(join(tmpdir(), 'hicode-planos-'))

afterEach(() => {
  delete process.env.HICODE_CLAUDE_CONFIG
  delete process.env.HICODE_KIMI_CONFIG
  delete process.env.HICODE_OLLAMA_URL
})

function claudeFake(conteudo: object, nome: string): string {
  const p = join(dir, nome)
  writeFileSync(p, JSON.stringify(conteudo))
  return p
}

test('tier vira nome legivel, e tier desconhecido aparece cru em vez de sumir', () => {
  expect(nomeDoTier('default_claude_max_5x')).toBe('Max 5x')
  expect(nomeDoTier('default_claude_pro')).toBe('Pro')
  expect(nomeDoTier('tier_que_nao_conheco')).toBe('tier_que_nao_conheco')
  expect(nomeDoTier(undefined)).toBe('')
})

test('janelas de uso: so entram as que o provedor realmente reportou', () => {
  const j = janelasDe({
    five_hour: { utilization: 12, resets_at: '2026-08-18T20:00:00Z' },
    seven_day: { utilization: 40 },
    seven_day_opus: null,
    seven_day_sonnet: {},
  })
  expect(j.map(x => x.rotulo)).toEqual(['5h', '7d'])
  expect(j[0]?.percentual).toBe(12)
  expect(j[1]?.resetaEm).toBe('')
})

test('plano do claude sai do config local, com a idade do dado', () => {
  const agora = 1_800_000_000_000
  process.env.HICODE_CLAUDE_CONFIG = claudeFake({
    oauthAccount: { userRateLimitTier: 'default_claude_max_20x', organizationType: 'claude_team', seatTier: 'team_tier_2', billingType: 'stripe_subscription' },
    cachedUsageUtilization: { fetchedAtMs: agora - 2 * 3600000, utilization: { five_hour: { utilization: 7 } } },
  }, 'claude-a.json')
  const p = planoDoClaude(agora)
  expect(p.plano).toBe('Max 20x')
  expect(p.detalhe).toContain('Team')
  expect(p.detalhe).toContain('assinatura')
  expect(p.janelas[0]?.percentual).toBe(7)
  expect(p.idadeHoras).toBeCloseTo(2, 5)
})

test('sem config o plano nao inventa nada', () => {
  process.env.HICODE_CLAUDE_CONFIG = join(dir, 'nao-existe.json')
  const p = planoDoClaude(1_800_000_000_000)
  expect(p.plano).toBe('')
  expect(p.janelas).toEqual([])
  expect(p.idadeHoras).toBe(-1)
})

test('config corrompido nao lanca', () => {
  const p = join(dir, 'ruim.json')
  writeFileSync(p, '{ nao e json')
  process.env.HICODE_CLAUDE_CONFIG = p
  expect(() => planoDoClaude(1)).not.toThrow()
})

const TOML = `default_model = "kimi-code/kimi-for-coding"
[providers."managed:kimi-code"]
type = "kimi"
api_key = "sk-SEGREDO-QUE-NAO-PODE-VAZAR-123456"
[providers."managed:kimi-code".oauth]
key = "outro-SEGREDO-aqui"
[models."kimi-code/k3"]
display_name = "K3"
[models."kimi-code/kimi-for-coding"]
display_name = "K2.7 Coding"
`

test('modelos e provedor do kimi saem do toml', () => {
  expect(modelosDoKimi(TOML)).toEqual(['K3', 'K2.7 Coding'])
  expect(provedorDoKimi(TOML)).toBe('managed:kimi-code')
})

test('SEGURANCA: nada do plano do kimi carrega api_key nem token', () => {
  const p = join(dir, 'kimi.toml')
  writeFileSync(p, TOML)
  process.env.HICODE_KIMI_CONFIG = p
  const serializado = JSON.stringify(planoDoKimi())
  expect(serializado).not.toContain('SEGREDO')
  expect(serializado).not.toContain('sk-')
  expect(serializado).toContain('gerenciado (oauth)')
})

test('ollama: sonda que nao responde devolve desabilitado em vez de travar', async () => {
  process.env.HICODE_OLLAMA_URL = 'http://127.0.0.1:1'
  const e = await sondarOllama(123)
  expect(e.habilitado).toBe(false)
  expect(e.modelos).toEqual([])
  expect(e.verificadoEm).toBe(123)
})
