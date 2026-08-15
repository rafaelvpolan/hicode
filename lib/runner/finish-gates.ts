import { isoNow } from '../card'
import type { StepMap } from '../card'
import { MAX_REAJUSTE } from './config'
import { patchCard } from './card-store'
import { run } from './git'
import { runStep } from './agent'
import { resolveCommand } from './commands'
import { addMetric } from './finish-metrics'
import type { Contract, PackageInfo } from '../contract/types'

export interface RunCtx {
  contract: Contract
  pkg: PackageInfo | undefined
  target: string
}

export async function buildWithReajuste(id: string, wt: string, ctx: RunCtx, fsteps: StepMap, timeKey: string, reajusteKey: string): Promise<boolean> {
  const cmd = resolveCommand(ctx.contract, 'build', wt, ctx.pkg)
  if (!cmd) {
    patchCard(id, {}, `${isoNow()} build: alvo sem script de build no contrato — gate de build pulado`)
    return true
  }
  const tb = Date.now()
  let b = await run(cmd.cmd, cmd.args, { cwd: cmd.cwd, timeout: 240000 })
  addMetric(fsteps, timeKey, { time: Math.round((Date.now() - tb) / 1000), cost: 0, tokens: 0 })
  let reajuste = 0
  while (b.err && reajuste < MAX_REAJUSTE) {
    reajuste++
    const tr = Date.now()
    const detail = String(b.stderr || b.stdout || '').slice(0, 1500)
    const rr = await runStep(wt, 'rufus', `O build/typecheck/lint falhou (${cmd.label}). Saida:\n${detail}\nCorrija os erros de tipo/lint/build no codigo alterado sem mudar o comportamento. Nao use any nem unknown.`, id, ctx.target)
    b = await run(cmd.cmd, cmd.args, { cwd: cmd.cwd, timeout: 240000 })
    addMetric(fsteps, reajusteKey, { time: Math.round((Date.now() - tr) / 1000), cost: rr.cost, tokens: rr.tokens })
    patchCard(id, {}, `${isoNow()} REAJUSTE (${reajuste}/${MAX_REAJUSTE}, rufus): ${rr.text || 'ajustou'} (custo $${rr.cost.toFixed(4)} · ${rr.tokens} tokens)`)
    process.stdout.write(`[runner] #${id}: REAJUSTE ${reajuste} (rufus)\n`)
  }
  if (!b.err) patchCard(id, {}, `${isoNow()} build (${cmd.label}) exit=0${reajuste ? ` (apos ${reajuste} reajuste)` : ''}`)
  return !b.err
}

export async function testGate(id: string, wt: string, ctx: RunCtx, fsteps: StepMap, label: string): Promise<boolean> {
  const cmd = resolveCommand(ctx.contract, 'test', wt, ctx.pkg)
  if (!cmd) {
    patchCard(id, {}, `${isoNow()} ${label}: alvo sem script de teste no contrato — gate de teste pulado`)
    return true
  }
  const tb = Date.now()
  let t = await run(cmd.cmd, cmd.args, { cwd: cmd.cwd, timeout: 240000 })
  addMetric(fsteps, label, { time: Math.round((Date.now() - tb) / 1000), cost: 0, tokens: 0 })
  let reajuste = 0
  while (t.err && reajuste < MAX_REAJUSTE) {
    reajuste++
    const tr = Date.now()
    const detail = String(t.stderr || t.stdout || '').slice(0, 1500)
    const rr = await runStep(wt, 'testudo', `Os testes do projeto falharam (${cmd.label}). Saida:\n${detail}\nCorrija os testes ou o codigo alterado sem mudar o comportamento pretendido. Nao use any nem unknown.`, id, ctx.target)
    t = await run(cmd.cmd, cmd.args, { cwd: cmd.cwd, timeout: 240000 })
    addMetric(fsteps, label, { time: Math.round((Date.now() - tr) / 1000), cost: rr.cost, tokens: rr.tokens })
    patchCard(id, {}, `${isoNow()} REAJUSTE testes (${reajuste}/${MAX_REAJUSTE}, testudo): ${rr.text || 'ajustou'} (custo $${rr.cost.toFixed(4)} · ${rr.tokens} tokens)`)
  }
  if (!t.err) patchCard(id, {}, `${isoNow()} ${label}: ${cmd.label} exit=0${reajuste ? ` (apos ${reajuste} reajuste)` : ''}`)
  return !t.err
}
