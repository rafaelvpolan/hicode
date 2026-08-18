import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = dirname(import.meta.dir)
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'hicode-confina-')))
const WT = join(BASE, 'worktree')
const BIN = join(BASE, 'bin')
const ARGV_FILE = join(BASE, 'argv.txt')
const CWD_FILE = join(BASE, 'cwd.txt')
const SHOTS = join(BASE, 'shots')

mkdirSync(WT, { recursive: true })
mkdirSync(BIN, { recursive: true })
mkdirSync(SHOTS, { recursive: true })
writeFileSync(join(SHOTS, 'preview.png'), 'png-falso')

process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })
process.env.HICODE_REPOS_FILE = join(BASE, 'repos.json')
process.env.HICODE_IA_FILE = join(BASE, 'ia.json')
process.env.HICODE_AGENTS_DIR = join(REPO, '.claude', 'agents')
process.env.HICODE_PROJECT_MEMORY = 'off'
process.env.CONF_ARGV_FILE = ARGV_FILE
process.env.CONF_CWD_FILE = CWD_FILE
delete process.env.HICODE_EFFORT
delete process.env.HICODE_AI_PROVIDER
delete process.env.HICODE_IMPLEMENT_PROVIDER
delete process.env.HICODE_STEP_PROVIDER
delete process.env.HICODE_VERIFY_PROVIDER

const FAKE = `#!/usr/bin/env bash
if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then
  echo "Checking MCP server health…"
  echo "omc: node /falso/omc-bridge.cjs - Connected"
  echo "playwright: npx -y @playwright/mcp - Connected"
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
  if [ "$CONF_OMC_ESCOPO" = "dinamico" ]; then
    echo "  Scope: Dynamic config (from command line)"
  else
    echo "  Scope: User config (available in all your projects)"
  fi
  exit 0
fi
: > "$CONF_ARGV_FILE"
for a in "$@"; do printf '%s\\0' "$a" >> "$CONF_ARGV_FILE"; done
pwd -P > "$CONF_CWD_FILE"
FORMATO=json
for a in "$@"; do if [ "$a" = "stream-json" ]; then FORMATO=stream; fi; done
if [ "$FORMATO" = "stream" ]; then
  echo '{"type":"system","subtype":"init","model":"falso"}'
  echo '{"type":"assistant","message":{"content":[{"type":"text","text":"feito"}]}}'
  echo '{"type":"result","total_cost_usd":0.01,"result":"feito","is_error":false}'
  exit 0
fi
echo '{"total_cost_usd":0.01,"result":"feito","is_error":false,"usage":{"input_tokens":10,"output_tokens":5}}'
`

writeFileSync(join(BIN, 'claude'), FAKE)
chmodSync(join(BIN, 'claude'), 0o755)

const PATH_ORIGINAL = process.env.PATH ?? ''
process.env.PATH = `${BIN}:${PATH_ORIGINAL}`

afterAll(() => {
  process.env.PATH = PATH_ORIGINAL
  delete process.env.CONF_ARGV_FILE
  delete process.env.CONF_CWD_FILE
  delete process.env.CONF_OMC_ESCOPO
  rmSync(BASE, { recursive: true, force: true })
})

const { implement, runStep, AGENTES_IMPLEMENT } = await import('../lib/runner/agent')
const { agentesNexus, agentesNexusJson, agentesNexusJsonPor, agentesNexusPor } = await import('../lib/ai/agentes-nexus')
const { ferramentasDeNavegacao, TOOLS_NAVEGACAO } = await import('../lib/ai/mcp')
const { ClaudeProvider, agentsArgv, claudeArgv } = await import('../lib/ai/adapters/claude')
const { verifyVisual } = await import('../lib/runner/agent')
const { ROOT } = await import('../lib/runner/config')
const CARTAO = { file: '', fm: { title: 'ajustar o rodape da pagina' }, order: [], body: '' }

function argvDoDisco(): string[] {
  if (!existsSync(ARGV_FILE)) return []
  return readFileSync(ARGV_FILE, 'utf8').split('\0').filter(s => s.length > 0)
}

function cwdDoDisco(): string {
  return existsSync(CWD_FILE) ? readFileSync(CWD_FILE, 'utf8').trim() : ''
}

function limpar(): void {
  rmSync(ARGV_FILE, { force: true })
  rmSync(CWD_FILE, { force: true })
}

function agentsJsonDoDisco(): string {
  const a = argvDoDisco()
  const i = a.indexOf('--agents')
  return i >= 0 ? (a[i + 1] ?? '') : ''
}

function agentesDoDisco(): Record<string, { description?: string; prompt?: string; tools?: string }> {
  const json = agentsJsonDoDisco()
  if (!json) return {}
  return JSON.parse(json) as Record<string, { description?: string; prompt?: string; tools?: string }>
}

const MAX_ARGV_BYTES = 131072

test('runStep roda o CLI COM cwd no worktree do card — nao no hicode (plano de controle)', async () => {
  limpar()
  process.env.CONF_OMC_ESCOPO = 'user'
  await runStep(WT, 'testudo', 'garanta cobertura')
  expect(cwdDoDisco()).toBe(WT)
  expect(cwdDoDisco()).not.toBe(realpathSync(ROOT))
})

test('runStep segue passando --add-dir do worktree junto do cwd confinado', () => {
  const a = argvDoDisco()
  expect(a.filter(x => x === '--add-dir')).toHaveLength(1)
  expect(a[a.indexOf('--add-dir') + 1]).toBe(WT)
})

test('--agents leva SO o agente do passo, nao o catalogo inteiro dos 16', () => {
  const injetados = Object.keys(agentesDoDisco())
  expect(injetados).toEqual(['testudo'])
  const catalogo = Object.keys(agentesNexus())
  expect(catalogo.length).toBeGreaterThan(10)
  expect(catalogo).toContain('crivo')
  expect(agentsJsonDoDisco().length).toBeGreaterThan(0)
  expect(agentsJsonDoDisco().length).toBeLessThan(JSON.stringify(agentesNexus()).length / 4)
})

test('o agente injetado leva as tools do omc junto das suas — senao o worker que edita nao alcanca a navegacao semantica', () => {
  const tools = String(agentesDoDisco().testudo?.tools ?? '').split(',').map(t => t.trim())
  expect(tools).toContain('mcp__omc__lsp_goto_definition')
  expect(tools).toContain('mcp__omc__ast_grep_search')
  expect(tools).toContain('Edit')
})

test('a extensao de tools do agente injetado nao promove agente read-only a editor', () => {
  const crivo = agentesNexusPor(['crivo'], ['mcp__omc__lsp_hover'])['crivo']
  const tools = String(crivo?.tools ?? '').split(',').map(t => t.trim())
  expect(tools).toContain('mcp__omc__lsp_hover')
  expect(tools).toContain('Read')
  for (const escrita of ['Edit', 'Write', 'Bash']) expect(tools).not.toContain(escrita)
})

test('o catalogo inteiro NAO cabe num argv (E2BIG) — a injecao seletiva e correcao, nao otimizacao', () => {
  expect(Buffer.byteLength(agentesNexusJson())).toBeGreaterThan(MAX_ARGV_BYTES)
  expect(Buffer.byteLength(agentesNexusJsonPor(AGENTES_IMPLEMENT))).toBeLessThan(MAX_ARGV_BYTES)
  for (const nome of Object.keys(agentesNexus())) {
    expect(Buffer.byteLength(agentesNexusJsonPor([nome]))).toBeLessThan(MAX_ARGV_BYTES)
  }
})

test('o JSON de --agents e valido e traz description e prompt do agente pedido', () => {
  const agentes = agentesDoDisco()
  const testudo = agentes.testudo
  expect(testudo).toBeDefined()
  expect(String(testudo?.description ?? '').length).toBeGreaterThan(10)
  expect(String(testudo?.prompt ?? '').length).toBeGreaterThan(50)
})

test('tools do omc entram no modo edit quando o conector esta conectado E persistente', () => {
  const a = argvDoDisco()
  const tools = String(a[a.indexOf('--allowedTools') + 1] ?? '').split(',')
  expect(tools).toContain('mcp__omc__lsp_goto_definition')
  expect(tools).toContain('mcp__omc__ast_grep_search')
  expect(tools).toContain('Task')
})

test('tools do omc NAO entram quando o escopo do conector e dinamico (nao chega no subprocesso)', async () => {
  limpar()
  process.env.CONF_OMC_ESCOPO = 'dinamico'
  await runStep(WT, 'rufus', 'refatore sem mudar comportamento')
  const a = argvDoDisco()
  expect(a.join(' ')).not.toContain('mcp__omc')
  expect(cwdDoDisco()).toBe(WT)
  process.env.CONF_OMC_ESCOPO = 'user'
})

test('--agents nao aparece quando nao ha agente a injetar', async () => {
  limpar()
  await runStep(WT, 'agente-que-nao-existe', 'faca algo')
  expect(argvDoDisco()).not.toContain('--agents')
  expect(agentesNexusJsonPor(['agente-que-nao-existe'])).toBe('')
})

test('agentsArgv omite a flag com JSON vazio, ausente ou so espaco', () => {
  const base = { prompt: 'p', cwd: WT, dirs: [], mode: 'edit' as const, useAgents: true, timeoutMs: 1000 }
  expect(agentsArgv(base)).toEqual([])
  expect(agentsArgv({ ...base, agentsJson: '' })).toEqual([])
  expect(agentsArgv({ ...base, agentsJson: '   ' })).toEqual([])
  expect(agentsArgv({ ...base, agentsJson: '{"x":{}}' })).toEqual(['--agents', '{"x":{}}'])
  expect(claudeArgv({ ...base, agentsJson: '{"x":{}}' })).toContain('--agents')
})

test('implement confina no worktree e injeta os agentes de roteamento, sem o crivo', async () => {
  limpar()
  await implement(CARTAO, WT)
  expect(cwdDoDisco()).toBe(WT)
  const injetados = Object.keys(agentesDoDisco())
  expect(injetados.sort()).toEqual([...AGENTES_IMPLEMENT].sort())
  for (const fora of ['crivo', 'testudo', 'escudo', 'pura']) expect(injetados).not.toContain(fora)
  expect(argvDoDisco()[argvDoDisco().indexOf('--add-dir') + 1]).toBe(WT)
})

test('o prompt de implement so roteia para agente que ele mesmo injeta', async () => {
  limpar()
  await implement(CARTAO, WT)
  const a = argvDoDisco()
  const prompt = String(a[a.indexOf('-p') + 1] ?? '')
  const roteados = [...prompt.matchAll(/->\s*([a-z]+)/g)].map(m => m[1] ?? '')
  expect(roteados.length).toBeGreaterThan(0)
  for (const agente of roteados) expect(AGENTES_IMPLEMENT).toContain(agente)
})

test('modo readonly (verifyVisual) fica no ROOT de proposito, sem tools do omc e sem --agents', async () => {
  limpar()
  await verifyVisual(CARTAO, join(SHOTS, 'preview.png'))
  expect(cwdDoDisco()).toBe(realpathSync(ROOT))
  const a = argvDoDisco()
  expect(a).not.toContain('--agents')
  expect(a.join(' ')).not.toContain('mcp__omc')
  expect(a).not.toContain('--permission-mode')
})

test('ferramentasDeNavegacao libera lsp e ast_grep e NUNCA notepad/wiki/state/project_memory', () => {
  const liberadas = ferramentasDeNavegacao({ usavel: true, motivo: '', tools: ['mcp__omc'] })
  expect(liberadas).toEqual([
    'mcp__omc__lsp_servers',
    'mcp__omc__lsp_hover',
    'mcp__omc__lsp_goto_definition',
    'mcp__omc__lsp_find_references',
    'mcp__omc__lsp_document_symbols',
    'mcp__omc__lsp_workspace_symbols',
    'mcp__omc__lsp_diagnostics',
    'mcp__omc__lsp_diagnostics_directory',
    'mcp__omc__ast_grep_search',
  ])
  expect(TOOLS_NAVEGACAO).toHaveLength(9)
  for (const proibido of ['notepad', 'wiki', 'state_', 'project_memory', 'shared_memory', 'python_repl', 'ast_grep_replace', 'lsp_rename', 'lsp_code_action', 'lsp_prepare_rename', 'session_search', 'merge_readiness', 'trace_', 'deepinit', 'omc_skills']) {
    expect(liberadas.join(' ')).not.toContain(proibido)
  }
})

test('ferramentasDeNavegacao nao libera nada quando o conector nao e usavel', () => {
  expect(ferramentasDeNavegacao({ usavel: false, motivo: 'escopo dinamico', tools: [] })).toEqual([])
  expect(ferramentasDeNavegacao({ usavel: false, motivo: 'pede auth', tools: ['mcp__omc'] })).toEqual([])
})

test('runStep na forma de PRODUCAO (com id, logo com live-log) confina o cwd no worktree', async () => {
  limpar()
  await runStep(WT, 'testudo', 'garanta cobertura', 'card-producao')
  expect(argvDoDisco()).toContain('stream-json')
  expect(cwdDoDisco()).toBe(WT)
  expect(cwdDoDisco()).not.toBe(realpathSync(ROOT))
  expect(argvDoDisco()[argvDoDisco().indexOf('--add-dir') + 1]).toBe(WT)
})

test('REGRESSAO: a forma de PRODUCAO (stream-json) carrega --agents — era aqui que os agentes Nexus sumiam', () => {
  const a = argvDoDisco()
  expect(a).toContain('stream-json')
  expect(a).toContain('--agents')
  expect(a.join(' ')).toContain('mcp__omc__lsp_hover')
  const json = a[a.indexOf('--agents') + 1] ?? ''
  expect(JSON.parse(json)).toHaveProperty('testudo')
})

test('REGRESSAO: o caminho de live-log carrega --effort e --agents como o de json', async () => {
  const req = { prompt: 'faca algo', cwd: WT, dirs: [WT], mode: 'edit' as const, useAgents: true, effort: 'high', timeoutMs: 20000, agentsJson: agentesNexusJsonPor(['limpio']) }
  expect(claudeArgv(req)).toContain('--effort')
  expect(claudeArgv(req)).toContain('--agents')
  limpar()
  const res = await new ClaudeProvider().run({ ...req, liveLog: join(BASE, 'live.log') })
  expect(res.ok).toBe(true)
  expect(cwdDoDisco()).toBe(WT)
  expect(argvDoDisco()).toContain('--add-dir')
  expect(argvDoDisco()).toContain('--effort')
  expect(argvDoDisco()[argvDoDisco().indexOf('--effort') + 1]).toBe('high')
  expect(argvDoDisco()).toContain('--agents')
})
