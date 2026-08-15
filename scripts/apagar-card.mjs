#!/usr/bin/env node
import { readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const RAIZ = process.env.HICODE_ROOT || dirname(dirname(fileURLToPath(import.meta.url)))
const CARDS = process.env.HICODE_CARDS_DIR || join(RAIZ, 'cards')
const RUNS = join(CARDS, 'runs')
const PREVIEWS = join(CARDS, 'previews')

const args = process.argv.slice(2)
const sim = args.includes('--yes') || args.includes('-y')
const force = args.includes('--force') || args.includes('-f')
const ids = args.filter((a) => !a.startsWith('-'))

const EM_VOO = ['EXECUTING', 'CORRECTING']

function normalizar(id) {
  const cru = String(id ?? '').trim()
  return /^\d+$/.test(cru) ? String(Number(cru)).padStart(3, '0') : cru
}

function arquivoDoCard(id) {
  if (!existsSync(CARDS)) return ''
  const alvo = normalizar(id)
  return readdirSync(CARDS).find((f) => f.endsWith('.md') && f.split('-')[0] === alvo) ?? ''
}

function frontmatter(caminho) {
  const texto = readFileSync(caminho, 'utf8')
  const m = texto.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const campos = {}
  for (const linha of m[1].split('\n')) {
    const i = linha.indexOf(':')
    if (i > 0) campos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
  }
  return campos
}

function pararPreview(pid) {
  const n = Number(pid)
  if (!n) return false
  try {
    process.kill(-n, 'SIGTERM')
    return true
  } catch {
    try {
      process.kill(n, 'SIGTERM')
      return true
    } catch {
      return false
    }
  }
}

function removerWorktree(alvo, caminho) {
  if (!alvo || !caminho || !existsSync(caminho)) return false
  try {
    execFileSync('git', ['-C', alvo, 'worktree', 'remove', '--force', caminho], { stdio: 'pipe' })
    return true
  } catch {
    try {
      rmSync(caminho, { recursive: true, force: true })
      execFileSync('git', ['-C', alvo, 'worktree', 'prune'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }
}

function caminhoDoRepo(nome) {
  const registro = join(RAIZ, 'config', 'repos.json')
  if (!nome || !existsSync(registro)) return ''
  try {
    const dados = JSON.parse(readFileSync(registro, 'utf8'))
    const lista = Array.isArray(dados) ? dados : (dados.repos ?? [])
    return lista.find((r) => r.name === nome)?.path ?? ''
  } catch {
    return ''
  }
}

function arquivosDaExecucao(id) {
  if (!existsSync(RUNS)) return []
  return readdirSync(RUNS).filter((f) => f === `${id}.live.log` || f.startsWith(`${id}.`) || f.startsWith(`${id}-`))
}

if (!ids.length) {
  console.log('')
  console.log('  uso: node scripts/apagar-card.mjs <id> [id...] [--yes] [--force]')
  console.log('')
  console.log('  sem --yes, apenas mostra o que seria apagado')
  console.log('  --force apaga tambem card em EXECUTING/CORRECTING')
  console.log('')
  process.exit(1)
}

const planos = []
const vistos = new Set()

for (const cru of ids) {
  const id = normalizar(cru)
  if (!id || vistos.has(id)) continue
  vistos.add(id)
  const arquivo = arquivoDoCard(id)
  if (!arquivo) {
    console.log(`  #${id} nao encontrado`)
    continue
  }
  const fm = frontmatter(join(CARDS, arquivo))
  const bloqueado = EM_VOO.includes(fm.status ?? '')
  if (bloqueado && !force) {
    console.log(`  #${id} fica — esta em ${fm.status}; use --force para apagar assim mesmo`)
    continue
  }
  planos.push({ id, arquivo, fm, runs: arquivosDaExecucao(id) })
}

if (!planos.length) {
  console.log('')
  console.log('  nada a apagar')
  console.log('')
  process.exit(1)
}

console.log('')
for (const p of planos) {
  console.log(`  #${p.id} ${(p.fm.status ?? '?').padEnd(10)} ${(p.fm.title ?? '').slice(0, 46)}`)
  if (p.fm.worktree) console.log(`      worktree  ${p.fm.worktree}`)
  if (p.fm.preview_pid) console.log(`      preview   pid ${p.fm.preview_pid}`)
  if (p.runs.length) console.log(`      execucao  ${p.runs.length} arquivo(s)`)
  if (p.fm.branch) console.log(`      branch    ${p.fm.branch}  (fica — o commit nao se perde)`)
}
console.log('')

if (!sim) {
  console.log(`  nada foi apagado — repita com --yes para apagar ${planos.length} card(s)`)
  console.log('')
  process.exit(0)
}

let apagados = 0
for (const p of planos) {
  const limpou = []
  if (p.fm.preview_pid && pararPreview(p.fm.preview_pid)) limpou.push('preview parado')
  if (removerWorktree(caminhoDoRepo(p.fm.repo), p.fm.worktree)) limpou.push('worktree removido')
  for (const f of p.runs) rmSync(join(RUNS, f), { force: true })
  if (p.runs.length) limpou.push(`${p.runs.length} arquivo(s) de execucao`)
  const preview = join(PREVIEWS, p.id)
  if (existsSync(preview) && statSync(preview).isDirectory()) {
    rmSync(preview, { recursive: true, force: true })
    limpou.push('preview salvo')
  }
  rmSync(join(CARDS, p.arquivo), { force: true })
  limpou.push('card apagado')
  apagados++
  console.log(`  #${p.id} — ${limpou.join(', ')}`)
}

console.log('')
console.log(`  ${apagados} card(s) apagado(s)`)
console.log('')
