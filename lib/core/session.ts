export type EffectKind =
  | 'none' | 'submit' | 'approve-plan' | 'discard-plan' | 'board' | 'cards'
  | 'watch' | 'halt' | 'plan' | 'help' | 'quit' | 'error'
  | 'approve-preview' | 'reject-preview' | 'reopen-repo' | 'activity'
  | 'ask' | 'answer'

export interface SessionState {
  repo: string
  pendingPlan: string
  seguindo: string
  perguntando: string
}

export interface Effect {
  kind: EffectKind
  id?: string
  text?: string
}

export interface Reply {
  effect: Effect
  state: SessionState
}

export const COMMANDS = ['/help', '/board', '/cards', '/ok', '/no', '/ask', '/watch', '/agents', '/halt', '/plan', '/repo', '/quit'] as const

export function newSession(repo = ''): SessionState {
  return { repo, pendingPlan: '', seguindo: '', perguntando: '' }
}

export function perguntando(state: SessionState, id: string): SessionState {
  return { ...state, perguntando: id, pendingPlan: '' }
}

export function respondido(state: SessionState): SessionState {
  return { ...state, perguntando: '' }
}

export function seguir(state: SessionState, id: string): SessionState {
  return { ...state, seguindo: id }
}

function reply(effect: Effect, state: SessionState): Reply {
  return { effect, state }
}

function command(line: string, state: SessionState): Reply {
  const [head, ...rest] = line.slice(1).trim().split(/\s+/)
  const arg = rest.join(' ')
  const cleared = { ...state, pendingPlan: '' }
  switch (head) {
    case 'help':
    case 'h':
    case '?':
      return reply({ kind: 'help' }, state)
    case 'board':
      return reply({ kind: 'board' }, { ...state, seguindo: '' })
    case 'cards':
    case 'ls':
      return reply({ kind: 'cards', text: arg }, state)
    case 'watch':
    case 'seguir':
      return arg
        ? reply({ kind: 'watch', id: arg }, { ...state, seguindo: arg })
        : reply({ kind: 'none' }, { ...state, seguindo: '' })
    case 'halt':
      return rest[0]
        ? reply({ kind: 'halt', id: rest[0], text: rest.slice(1).join(' ') || 'parado pelo humano' }, cleared)
        : reply({ kind: 'error', text: 'uso: /halt <id> [motivo]' }, state)
    case 'plan':
      return arg ? reply({ kind: 'plan', id: arg }, state) : reply({ kind: 'error', text: 'uso: /plan <id>' }, state)
    case 'ask':
    case 'responder':
      return arg
        ? reply({ kind: 'ask', id: rest[0], text: rest.slice(1).join(' ') }, state)
        : reply({ kind: 'ask' }, state)
    case 'agents':
    case 'agentes':
      return arg
        ? reply({ kind: 'activity', id: arg }, state)
        : reply({ kind: 'error', text: 'uso: /agents <id> — agentes, skills e ferramentas usados' }, state)
    case 'ok':
    case 'aprovar':
      return arg
        ? reply({ kind: 'approve-preview', id: arg }, cleared)
        : reply({ kind: 'error', text: 'uso: /ok <id> — aprova o preview visto no dev server' }, state)
    case 'no':
    case 'rejeitar':
      return rest[0]
        ? reply({ kind: 'reject-preview', id: rest[0], text: rest.slice(1).join(' ') }, cleared)
        : reply({ kind: 'error', text: 'uso: /no <id> [o que corrigir]' }, state)
    case 'repo':
    case 'projeto':
      return arg
        ? reply({ kind: 'none' }, { ...state, repo: arg })
        : reply({ kind: 'reopen-repo' }, state)
    case 'quit':
    case 'exit':
    case 'q':
      return reply({ kind: 'quit' }, state)
    default:
      return reply({ kind: 'error', text: `comando desconhecido: /${head} — tente /help` }, state)
  }
}

export function handle(raw: string, state: SessionState): Reply {
  const line = raw.trim()
  if (!line) {
    if (state.perguntando) return reply({ kind: 'answer', id: state.perguntando, text: '' }, state)
    return state.pendingPlan
      ? reply({ kind: 'approve-plan', id: state.pendingPlan }, { ...state, pendingPlan: '' })
      : reply({ kind: 'none' }, state)
  }
  if (line.startsWith('/')) return command(line, state)
  if (state.perguntando) {
    return reply({ kind: 'answer', id: state.perguntando, text: line }, state)
  }
  if (/^#?\d{1,4}$/.test(line)) {
    return reply({ kind: 'plan', id: line.replace('#', '') }, state)
  }
  if (state.pendingPlan) {
    return reply({ kind: 'submit', text: line }, { ...state, pendingPlan: '' })
  }
  return reply({ kind: 'submit', text: line }, state)
}

export function planShown(state: SessionState, id: string): SessionState {
  return { ...state, pendingPlan: id }
}
