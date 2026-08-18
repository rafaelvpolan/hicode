import { test, expect } from 'bun:test'
import { recusaPorLimite } from '../lib/runner/cost-trust'
import { KimiProvider } from '../lib/ai/adapters/kimi'
import { ClaudeProvider } from '../lib/ai/adapters/claude'
import type { AgentRequest } from '../lib/ai/types'

const pedido = (mode: AgentRequest['mode']): AgentRequest => ({
  prompt: 'x', cwd: '/tmp', dirs: [], mode, useAgents: false, timeoutMs: 1000,
})

test('kimi e RECUSADO em modo somente-leitura — nao restringe ferramenta', () => {
  const r = recusaPorLimite(new KimiProvider(), pedido('readonly'))
  expect(r).toContain('somente-leitura')
  expect(r).toContain('kimi')
})

test('kimi passa em modo de edicao', () => {
  expect(recusaPorLimite(new KimiProvider(), pedido('edit'))).toBe('')
})

test('claude passa nos dois modos', () => {
  expect(recusaPorLimite(new ClaudeProvider(), pedido('readonly'))).toBe('')
  expect(recusaPorLimite(new ClaudeProvider(), pedido('edit'))).toBe('')
})

test('kimi em modo de edicao passa --auto — sem isso ele trava esperando aprovacao', async () => {
  const { kimiArgv } = await import('../lib/ai/adapters/kimi')
  expect(kimiArgv(pedido('edit'))).toContain('--auto')
  expect(kimiArgv(pedido('readonly'))).not.toContain('--auto')
})

test('kimi nunca recebe flag que o CLI dele nao tem', async () => {
  const { kimiArgv } = await import('../lib/ai/adapters/kimi')
  const argv = kimiArgv({ ...pedido('edit'), effort: 'high', model: 'kimi-for-coding' }).join(' ')
  expect(argv).not.toContain('--allowedTools')
  expect(argv).not.toContain('--effort')
  expect(argv).not.toContain('--permission-mode')
  expect(argv).toContain('-m kimi-for-coding')
})
