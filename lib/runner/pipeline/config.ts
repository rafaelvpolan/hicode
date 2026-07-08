import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { STATUSES } from '../../card'
import { ROOT } from '../config'
import type { PipelineConfig, PipelineStep } from './types'

export const DEFAULT_STEPS: PipelineStep[] = [
  { id: 'arquitetura', label: 'Arquitetura', kind: 'quality', agent: 'rufus', state: 'REFINED', gate: 'none', enabled: true, gated: true, instruction: 'Melhore a arquitetura/refatore o codigo relacionado a: "%s" sem mudar o comportamento observavel. Se nao houver ganho claro, nao mude nada.' },
  { id: 'testes', label: 'Testes', kind: 'quality', agent: 'testudo', state: 'TESTS_GREEN', gate: 'test', enabled: true, gated: true, instruction: 'Garanta cobertura de testes para: "%s". Escreva/ajuste testes se aplicavel ao projeto.' },
  { id: 'seguranca', label: 'Seguranca', kind: 'security', agent: 'escudo', state: 'SEC_CLEARED', gate: 'none', enabled: true, gated: true, instruction: 'Revise seguranca (OWASP, secrets, XSS, deps) do que foi alterado para: "%s". Corrija problemas criticos.' },
  { id: 'review', label: 'Review', kind: 'review', agent: 'crivo', state: 'REVIEWED', gate: 'none', enabled: true, instruction: 'Revise adversarialmente (read-only) o diff atual vs a tarefa "%s". Aponte problemas; nao edite arquivos.' },
  { id: 'limpeza', label: 'Limpeza', kind: 'cleanup', agent: 'pura', state: 'CLEANED', gate: 'none', enabled: true, instruction: 'Remova comentarios de prosa do codigo alterado (preserve licenca, diretivas de tooling, TODO/ticket).' },
]

function isValidStep(s: PipelineStep): boolean {
  return !!(s && s.id && s.label && s.agent && s.state && (STATUSES as readonly string[]).includes(s.state))
}

export function loadPipeline(worktree?: string): PipelineConfig {
  const candidates = worktree
    ? [join(worktree, '.hicode', 'pipeline.json'), join(ROOT, 'config', 'pipeline.json')]
    : [join(ROOT, 'config', 'pipeline.json')]
  for (const f of candidates) {
    if (!existsSync(f)) continue
    try {
      const raw = JSON.parse(readFileSync(f, 'utf8')) as Partial<PipelineConfig>
      const steps = Array.isArray(raw.steps) ? raw.steps.filter(isValidStep) : []
      if (steps.length) return { version: Number(raw.version) || 1, steps }
    } catch {
      continue
    }
  }
  return { version: 1, steps: DEFAULT_STEPS }
}

export function activeSteps(worktree?: string): PipelineStep[] {
  return loadPipeline(worktree).steps.filter(s => s.enabled !== false)
}
