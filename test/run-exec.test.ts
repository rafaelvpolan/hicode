import { test, expect } from 'bun:test'
import { run } from '../lib/runner/git'

test('run mata o processo no timeout (err.killed) e retorna rapido', async () => {
  const t0 = Date.now()
  const { err } = await run('sleep', ['10'], { timeout: 400 })
  const elapsed = Date.now() - t0
  expect(err?.killed).toBe(true)
  expect(elapsed).toBeLessThan(3000)
})

test('run injeta env git nao-interativo (GIT_EDITOR=true)', async () => {
  const { stdout } = await run('git', ['var', 'GIT_EDITOR'])
  expect(stdout.trim()).toBe('true')
})

test('run injeta GIT_TERMINAL_PROMPT=0', async () => {
  const { stdout } = await run('printenv', ['GIT_TERMINAL_PROMPT'])
  expect(stdout.trim()).toBe('0')
})

test('run sem timeout roda normal e sem err', async () => {
  const { err, stdout } = await run('echo', ['ok'])
  expect(err).toBeNull()
  expect(stdout.trim()).toBe('ok')
})
