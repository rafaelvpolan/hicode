import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { repoStatus } from './repos'
import { readContract } from '../contract/store'
import { daemonStatus } from './daemon'
import { providerNameFor } from '../ai/registry'

export type Severity = 'ok' | 'aviso' | 'erro'

export interface Check {
  nome: string
  severidade: Severity
  detalhe: string
  conserto: string
}

const NONINTERACTIVE = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' }

function exec(cmd: string, args: string[], cwd?: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...NONINTERACTIVE }, timeout: 20000,
    })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string }
    return { ok: false, out: String(err.stderr || err.stdout || err.message || '').trim() }
  }
}

function check(nome: string, severidade: Severity, detalhe: string, conserto = ''): Check {
  return { nome, severidade, detalhe, conserto }
}

export function checkGh(): Check {
  const versao = exec('gh', ['--version'])
  if (!versao.ok) return check('gh', 'erro', 'gh CLI nao encontrado', 'instale o gh — sem ele o motor nao abre PR')
  const auth = exec('gh', ['auth', 'status'])
  if (!auth.ok) return check('gh', 'erro', 'gh nao autenticado', 'gh auth login')
  const quem = auth.out.match(/account (\S+)|as (\S+)/)
  const nome = quem?.[1] ?? quem?.[2] ?? 'ok'
  return check('gh', 'ok', `autenticado (${nome})`)
}

export function checkGitPush(repoPath: string, repoName: string): Check {
  if (!existsSync(join(repoPath, '.git'))) return check('git push', 'erro', 'clone ausente', `hii repo add ${repoName} --path <dir>`)
  const probe = exec('git', ['push', '--dry-run', 'origin', 'HEAD:refs/heads/__hicode_probe__'], repoPath)
  if (!probe.ok) {
    const semCredencial = /could not read Username|Authentication failed|Permission denied|terminal prompts disabled/i.test(probe.out)
    return check(
      'git push',
      'erro',
      semCredencial ? 'git nao autentica no remoto sem prompt — o push do PR vai falhar' : `push recusado: ${probe.out.split('\n').pop()?.slice(0, 90)}`,
      semCredencial ? 'gh auth setup-git   (faz o git usar o token do gh)' : 'confira permissao de escrita e o remote origin',
    )
  }
  const perm = exec('gh', ['repo', 'view', repoName, '--json', 'viewerPermission', '-q', '.viewerPermission'])
  return check('git push', 'ok', perm.ok ? `autentica e escreve (${perm.out})` : 'autentica sem prompt')
}

export function checkProvider(): Check {
  const papeis = ['implement', 'verify', 'gate', 'step'] as const
  const nomes = [...new Set(papeis.map(p => providerNameFor(p)))]
  const faltando = nomes.filter(n => n !== 'ollama' && !exec(n === 'claude' ? 'claude' : n, ['--version']).ok)
  if (faltando.length) {
    return check('IA', 'erro', `CLI ausente: ${faltando.join(', ')}`, `instale ou troque o provedor por papel (HICODE_*_PROVIDER)`)
  }
  return check('IA', 'ok', `provedores: ${nomes.join(', ')}`)
}

export function checkContract(repoPath: string): Check {
  const c = readContract(repoPath)
  if (!c) return check('contrato', 'aviso', 'nao gerado', `hii contract ${repoPath}`)
  if (!c.commands.build && !c.commands.test) {
    return check('contrato', 'aviso', `${c.stack} — sem build nem test`, 'os gates de build/teste serao pulados')
  }
  return check('contrato', 'ok', c.stack)
}

export function checkDaemon(): Check {
  const s = daemonStatus()
  return s === 'offline'
    ? check('daemon', 'aviso', 'offline — cards ficam na fila', 'hii start')
    : check('daemon', 'ok', s)
}

export interface RepoReport {
  repo: string
  checks: Check[]
}

export interface Report {
  gerais: Check[]
  repos: RepoReport[]
  pior: Severity
}

function pior(checks: Check[]): Severity {
  if (checks.some(c => c.severidade === 'erro')) return 'erro'
  if (checks.some(c => c.severidade === 'aviso')) return 'aviso'
  return 'ok'
}

export function runDoctor(): Report {
  const gerais = [checkGh(), checkProvider(), checkDaemon()]
  const repos = repoStatus().map(r => ({
    repo: r.name,
    checks: [checkGitPush(r.path, r.name), checkContract(r.path)],
  }))
  return { gerais, repos, pior: pior([...gerais, ...repos.flatMap(r => r.checks)]) }
}

export function podeAbrirPr(repoPath: string, repoName: string): Check {
  return checkGitPush(repoPath, repoName)
}
