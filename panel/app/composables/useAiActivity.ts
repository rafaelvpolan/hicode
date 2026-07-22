import { computed, type ComputedRef, type Ref } from 'vue'

export type CurrentActionKind = 'tool' | 'done' | 'text'

export interface CurrentAction {
  kind: CurrentActionKind
  text: string
}

export interface UseAiActivityReturn {
  currentAction: ComputedRef<CurrentAction | null>
  isWorking: ComputedRef<boolean>
}

const TOOL_CALL_PATTERN = /^→\s*(\S+)\((.*)\)$/s
const DONE_MARKER_PATTERN = /^—\s*conclu[ií]do\b/i
const HINT_KEYS = ['file_path', 'path', 'file', 'command', 'pattern', 'url'] as const
const HINT_FALLBACK_PATTERN = /"(?:file_path|path|file|command|pattern|url)"\s*:\s*"([^"]{1,80})/

function truncate(value: string, max: number): string {
  const clean = value.trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function toolArgsHint(argsRaw: string): string | null {
  try {
    const parsed = JSON.parse(argsRaw) as Record<string, string | number | boolean | object | null>
    for (const key of HINT_KEYS) {
      const value = parsed[key]
      if (typeof value === 'string' && value) return truncate(value, 60)
    }
    return null
  } catch {
    const match = argsRaw.match(HINT_FALLBACK_PATTERN)
    return match ? truncate(match[1] ?? '', 60) : null
  }
}

function lastNonEmptyLine(log: string): string | null {
  const lines = log.split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.length ? (lines[lines.length - 1] ?? null) : null
}

function parseCurrentAction(log: string): CurrentAction | null {
  const last = lastNonEmptyLine(log)
  if (!last) return null

  const [, tool = '', argsRaw = ''] = last.match(TOOL_CALL_PATTERN) ?? []
  if (tool) {
    const hint = toolArgsHint(argsRaw)
    return { kind: 'tool', text: hint ? `agora: ${tool} · ${hint}` : `agora: ${tool}` }
  }

  if (DONE_MARKER_PATTERN.test(last)) return { kind: 'done', text: '✓ concluído' }

  return { kind: 'text', text: truncate(last, 140) }
}

export function useAiActivity(logText: Ref<string>): UseAiActivityReturn {
  const currentAction = computed<CurrentAction | null>(() => parseCurrentAction(logText.value))
  const isWorking = computed<boolean>(() => currentAction.value !== null && currentAction.value.kind !== 'done')
  return { currentAction, isWorking }
}
