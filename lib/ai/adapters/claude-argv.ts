import type { AgentRequest } from '../types'

const EDIT_TOOLS_AGENTS = 'Task,Read,Edit,Write,Glob,Grep,Bash'
const EDIT_TOOLS = 'Read,Edit,Write,Glob,Grep,Bash'
const READONLY_TOOLS = 'Read,Glob,Grep'

export const FORMATO_JSON = ['--output-format', 'json']
export const FORMATO_STREAM = ['--output-format', 'stream-json', '--verbose']

export function baseToolsFor(req: AgentRequest): string {
  if (req.mode !== 'edit') return READONLY_TOOLS
  return req.useAgents ? EDIT_TOOLS_AGENTS : EDIT_TOOLS
}

export function toolsFor(req: AgentRequest): string {
  const base = baseToolsFor(req).split(',')
  const extra = req.extraTools ?? []
  return Array.from(new Set([...base, ...extra])).join(',')
}

export function agentsArgv(req: AgentRequest): string[] {
  const json = (req.agentsJson ?? '').trim()
  return json ? ['--agents', json] : []
}

export function claudeArgv(req: AgentRequest, formato: string[] = FORMATO_JSON): string[] {
  const a = ['-p', req.prompt, ...formato]
  if (req.model) a.push('--model', req.model)
  if (req.effort) a.push('--effort', req.effort)
  if (req.mode === 'edit') a.push('--permission-mode', 'acceptEdits', '--allowedTools', toolsFor(req))
  else a.push('--allowedTools', toolsFor(req))
  a.push(...agentsArgv(req))
  for (const d of req.dirs) a.push('--add-dir', d)
  return a
}
