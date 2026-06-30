import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)))
const CARDS_DIR = join(ROOT, 'cards')
const REPOS_FILE = join(ROOT, 'config', 'repos.json')
const PREVIEW_URL = process.env.HICODE_PREVIEW_URL || 'http://localhost:5173'
const POLL_MS = Number(process.env.HICODE_POLL_MS || 5000)
const RUN_TIMEOUT_MS = Number(process.env.HICODE_RUN_TIMEOUT_MS || 300000)

function isoNow() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z') }

function splitFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, order: [], body: text }
  const fm = {}, order = []
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) { const k = line.slice(0, i).trim(); fm[k] = line.slice(i + 1).trim(); order.push(k) }
  }
  return { fm, order, body: m[2] }
}

function serializeCard(fm, order, body) {
  const keys = order.length ? order : Object.keys(fm)
  return `---\n${keys.map(k => `${k}: ${fm[k]}`).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}

function cardFiles() {
  return existsSync(CARDS_DIR) ? readdirSync(CARDS_DIR).filter(f => f.endsWith('.md')) : []
}

function findCardFile(id) { return cardFiles().find(f => f.startsWith(`${id}-`)) || null }

function readCard(id) {
  const f = findCardFile(id)
  if (!f) return null
  return { ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')), file: f }
}

function extractObjetivo(body) {
  const m = body.match(/##\s*Objetivo\s*\n([\s\S]*?)(?:\n##\s|$)/)
  return m ? m[1].trim() : ''
}

function appendLog(body, line) {
  const marker = '## Log de Estado'
  if (!body.includes(marker)) return `${body.trimEnd()}\n\n${marker}\n${line}`
  return `${body.trimEnd()}\n${line}`
}

function patchCard(id, fields, logLine) {
  const c = readCard(id)
  if (!c) return
  const { fm, order, body } = c
  for (const [k, v] of Object.entries(fields)) { fm[k] = v; if (!order.includes(k)) order.push(k) }
  fm.updated = isoNow()
  const nb = logLine ? appendLog(body, logLine) : body
  writeFileSync(join(CARDS_DIR, c.file), serializeCard(fm, order, nb) + '\n')
}

function executingCards() {
  return cardFiles()
    .map(f => ({ ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')).fm, file: f }))
    .filter(c => c.id && c.status === 'EXECUTING')
}

function repoPath(repoName) {
  try {
    const repos = JSON.parse(readFileSync(REPOS_FILE, 'utf8'))
    const r = repos.find(x => x.name === repoName)
    if (r && r.path) return r.path
  } catch { void 0 }
  return join(dirname(ROOT), basename(repoName || ''))
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 1 << 24, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' })
    })
  })
}

async function implement(card, target) {
  const desc = extractObjetivo(card.body) || card.fm.title
  const prompt = [
    'Use os AGENTES NEXUS deste projeto para implementar a tarefa abaixo (auto-construção do hicode).',
    `O código a alterar fica em: ${target} (Vite + Vue 3 + TypeScript). Edite os arquivos em src/ DESSE diretório — não edite arquivos do hicode.`,
    'Roteie para o agente certo via Task: frontend/Vue/UI -> vitro; lógica/feature -> limpio; banco/dados -> radix; refactor -> rufus. Depois de um agente gated (limpio/radix/rufus/escudo/testudo), passe o resultado pelo crivo.',
    'Faça a MENOR mudança que cumpra a tarefa. NÃO rode git, NÃO faça commit, NÃO inicie servidores (o dev server já está rodando). Sem comentários de prosa no código.',
    '',
    'TAREFA:',
    desc,
    '',
    'Ao terminar, responda em 1 linha: qual agente atuou e o que mudou.',
  ].join('\n')
  const { err, stdout, stderr } = await run('claude', [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--add-dir', target,
    '--allowedTools', 'Task,Read,Edit,Write,Glob,Grep,Bash',
  ], { cwd: ROOT, timeout: RUN_TIMEOUT_MS })
  let cost = '', resultText = '', isError = false, usage = {}
  try {
    const j = JSON.parse(stdout)
    cost = typeof j.total_cost_usd === 'number' ? j.total_cost_usd.toFixed(4) : ''
    resultText = String(j.result || '').split('\n')[0].slice(0, 140)
    isError = !!j.is_error
    const u = j.usage || {}
    usage = {
      tokens_in: u.input_tokens || 0,
      tokens_out: u.output_tokens || 0,
      tokens_cache_create: u.cache_creation_input_tokens || 0,
      tokens_cache_read: u.cache_read_input_tokens || 0,
    }
  } catch { resultText = String(stdout || stderr || '').split('\n')[0].slice(0, 140) }
  if (err) return { ok: false, reason: `claude ${err.killed ? 'timeout' : 'falhou: ' + err.message}`, cost, usage }
  if (isError) return { ok: false, reason: `claude is_error: ${resultText}`, cost, usage }
  return { ok: true, resultText, cost, usage }
}

async function screenshot(id) {
  const dir = join(CARDS_DIR, 'previews', String(id))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out = join(dir, 'preview.png')
  const { err } = await run('npx', ['--no-install', 'playwright', 'screenshot', '--viewport-size=1280,900', '--full-page', PREVIEW_URL, out], { cwd: ROOT, timeout: 60000 })
  return !err && existsSync(out)
}

function writeRun(id, res) {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const u = res.usage || {}
  const total = (u.tokens_in || 0) + (u.tokens_out || 0) + (u.tokens_cache_create || 0)
  const ts = isoNow()
  const safe = ts.replace(/[^0-9]/g, '').slice(0, 14)
  const rec = {
    id, ts, ok: !!res.ok, cost_usd: res.cost || '',
    tokens_in: u.tokens_in || 0, tokens_out: u.tokens_out || 0,
    tokens_cache_create: u.tokens_cache_create || 0, tokens_cache_read: u.tokens_cache_read || 0,
    tokens_total: total,
  }
  writeFileSync(join(dir, `${id}-${safe}.json`), JSON.stringify(rec, null, 2))
  return rec
}

function cardsByStatus(status) {
  return cardFiles()
    .map(f => ({ ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')).fm, file: f }))
    .filter(c => c.id && c.status === status)
}

function runGit(target, args) { return run('git', args, { cwd: target, timeout: 60000 }) }

function repoBase(repoName) {
  try {
    const repos = JSON.parse(readFileSync(REPOS_FILE, 'utf8'))
    const r = repos.find(x => x.name === repoName)
    if (r && r.branch) return r.branch
  } catch { void 0 }
  return 'main'
}

function hasBuildScript(target) {
  try {
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
    return !!(pkg.scripts && pkg.scripts.build)
  } catch { return false }
}

async function prepareBranch(target, card) {
  const branch = `hicode/${card.fm.id}-${card.fm.slug}`
  const base = repoBase(card.fm.repo)
  await runGit(target, ['checkout', base])
  await runGit(target, ['pull', '--ff-only'])
  await runGit(target, ['checkout', '-B', branch])
  return branch
}

async function handleExecute(id) {
  const card = readCard(id)
  const target = repoPath(card.fm.repo)
  if (!existsSync(target)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED repo nao encontrado: ${target}`)
    return
  }
  let branch = card.fm.branch || ''
  try { branch = await prepareBranch(target, card) } catch (e) { process.stdout.write(`[runner] aviso: branch prep falhou (${String(e && e.message)})\n`) }
  process.stdout.write(`[runner] card #${id}: implementando em ${target} (branch ${branch})\n`)
  const res = await implement(card, target)
  const rec = writeRun(id, res)
  if (!res.ok) {
    patchCard(id, { status: 'HALTED', cost_usd: res.cost || '', tokens_total: String(rec.tokens_total) }, `${isoNow()} EXECUTING->HALTED ${res.reason}`)
    process.stdout.write(`[runner] card #${id}: HALTED (${res.reason})\n`)
    return
  }
  patchCard(id, { branch, cost_usd: res.cost || '', tokens_total: String(rec.tokens_total) }, `${isoNow()} EXECUTING->EXECUTED ${res.resultText || 'mudanca aplicada'} (custo $${res.cost || '?'} · ${rec.tokens_total} tokens)`)
  await runGit(target, ['add', '-A'])
  await runGit(target, ['-c', 'commit.gpgsign=false', 'commit', '-m', `feat: ${card.fm.title} (#${id})`])
  await new Promise(r => setTimeout(r, 2500))
  const shot = await screenshot(id)
  patchCard(id, { status: 'PREVIEW', preview_url: PREVIEW_URL }, `${isoNow()} EXECUTED->PREVIEW ${PREVIEW_URL}${shot ? ' + screenshot' : ' (sem screenshot)'}`)
  process.stdout.write(`[runner] card #${id}: PREVIEW pronto\n`)
}

async function handleFinish(id) {
  const card = readCard(id)
  const target = repoPath(card.fm.repo)
  const base = repoBase(card.fm.repo)
  const branch = card.fm.branch || `hicode/${id}-${card.fm.slug}`
  const msg = `feat: ${card.fm.title} (#${id})`
  process.stdout.write(`[runner] card #${id}: finalizando (checkout + build + push + PR)\n`)
  const co = await runGit(target, ['checkout', branch])
  if (co.err) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED checkout da branch ${branch} falhou`)
    return
  }
  if (hasBuildScript(target)) {
    const b = await run('npm', ['run', 'build'], { cwd: target, timeout: 240000 })
    if (b.err) {
      patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED build falhou`)
      process.stdout.write(`[runner] card #${id}: HALTED (build falhou)\n`)
      return
    }
    patchCard(id, {}, `${isoNow()} PREVIEW_OK->TESTS_GREEN npm run build exit=0`)
  } else {
    patchCard(id, {}, `${isoNow()} PREVIEW_OK->TESTS_GREEN (sem script build)`)
  }
  const p = await runGit(target, ['push', '-u', 'origin', branch])
  if (p.err) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED push falhou: ${String(p.stderr || '').slice(0, 120)}`)
    return
  }
  const body = `Gerado pelo motor hicode (agentes Nexus). Card #${id}.\n\n${(card.desc || '').slice(0, 500)}`
  const pr = await run('gh', ['pr', 'create', '--repo', card.fm.repo, '--base', base, '--head', branch, '--title', msg, '--body', body], { cwd: target, timeout: 60000 })
  const url = String(pr.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
  if (pr.err && !url) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED gh pr create falhou: ${String(pr.stderr || '').slice(0, 120)}`)
    return
  }
  patchCard(id, { status: 'PR_OPEN', pr_url: url }, `${isoNow()} REVIEWED->PR_OPEN ${url}`)
  process.stdout.write(`[runner] card #${id}: PR_OPEN ${url}\n`)
}

let busy = false
async function tick() {
  if (busy) return
  const exec = cardsByStatus('EXECUTING')
  const finish = cardsByStatus('PREVIEW_OK')
  const job = exec[0] ? { kind: 'execute', id: exec[0].id } : finish[0] ? { kind: 'finish', id: finish[0].id } : null
  if (!job) return
  busy = true
  try {
    if (job.kind === 'execute') await handleExecute(job.id)
    else await handleFinish(job.id)
  } catch (e) {
    patchCard(job.id, { status: 'HALTED' }, `${isoNow()} HALTED erro: ${String((e && e.message) || e)}`)
  } finally {
    busy = false
  }
}

if (process.argv.includes('--once')) {
  tick().then(() => process.exit(0))
} else {
  process.stdout.write(`hicode runner ativo — vigiando cards EXECUTING (poll ${POLL_MS}ms, timeout ${RUN_TIMEOUT_MS}ms)\n`)
  setInterval(tick, POLL_MS)
  tick()
}
