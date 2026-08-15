import type { PipelineStep } from './types'

export function waves(steps: PipelineStep[]): PipelineStep[][] {
  const present = new Set(steps.map(s => s.id))
  const pending = [...steps]
  const done = new Set<string>()
  const out: PipelineStep[][] = []
  while (pending.length) {
    const ready = pending.filter(s => (s.needs ?? []).every(n => !present.has(n) || done.has(n)))
    const wave = ready.length ? ready : [pending[0] as PipelineStep]
    out.push(wave)
    for (const s of wave) {
      done.add(s.id)
      pending.splice(pending.indexOf(s), 1)
    }
  }
  return out
}
