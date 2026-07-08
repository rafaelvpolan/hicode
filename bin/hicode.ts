#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProgress } from '../lib/runner/progress'
import { initHicodeHome } from '../lib/runner/hicode-home'
import { installPrePush, uninstallPrePush } from '../lib/runner/hooks'
import { runSync } from '../lib/tasks/sync'
import { taskSyncName } from '../lib/tasks/registry'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DAEMON = join(ROOT, 'scripts', 'runner-daemon.sh')
const args = process.argv.slice(2)
const cmd = args[0]

function daemon(sub: string): number {
  return spawnSync(DAEMON, [sub], { stdio: 'inherit' }).status ?? 1
}

function runnerBun(extra: string[]): number {
  return spawnSync('bun', [join(ROOT, 'runner.ts'), ...extra], { stdio: 'inherit', cwd: ROOT }).status ?? 1
}

function usage(): void {
  process.stdout.write([
    'hicode — plano de controle autonomo',
    '',
    'Uso: hicode <comando>',
    '',
    '  start | stop | restart   controla o daemon do motor',
    '  status                   estado do daemon + progresso dos cards',
    '  watch                    progresso dos cards ao vivo',
    '  run                      motor em foreground (nao daemoniza)',
    '  once                     processa a fila uma vez e sai',
    '  sync                     sincroniza tarefas externas (HICODE_TASK_SYNC)',
    '  init [caminho]           provisiona .hicode/ num repo-alvo (default: cwd)',
    '  hooks install [caminho]  instala o pre-push deterministico num repo (default: cwd)',
    '  hooks uninstall [caminho] remove o pre-push',
    '',
  ].join('\n'))
}

function hooks(): number {
  const sub = args[1]
  const repo = args[2] || process.cwd()
  const source = join(ROOT, 'scripts', 'hooks', 'pre-push')
  if (sub === 'install') {
    const dest = installPrePush(repo, source)
    process.stdout.write(dest ? `pre-push instalado: ${dest}\n` : `falha ao instalar (repo git valido? hook fonte existe?)\n`)
    return dest ? 0 : 1
  }
  if (sub === 'uninstall') {
    const ok = uninstallPrePush(repo)
    process.stdout.write(ok ? `pre-push removido de ${repo}\n` : `nenhum pre-push encontrado em ${repo}\n`)
    return 0
  }
  process.stdout.write('uso: hicode hooks <install|uninstall> [caminho]\n')
  return 1
}

async function main(): Promise<number> {
  switch (cmd) {
    case 'start':
    case 'stop':
    case 'restart':
      return daemon(cmd)
    case 'status':
      daemon('status')
      process.stdout.write(`\n${renderProgress()}\n`)
      return 0
    case 'watch': {
      const draw = (): void => { process.stdout.write(`\x1b[2J\x1b[H${renderProgress()}\n`) }
      draw()
      setInterval(draw, 2000)
      return -1
    }
    case 'run':
      return runnerBun([])
    case 'once':
      return runnerBun(['--once'])
    case 'sync': {
      const r = await runSync()
      process.stdout.write(`sync (${taskSyncName()}): ${r.created} cards criados, ${r.pushed} espelhados de ${r.pulled} externos\n`)
      return 0
    }
    case 'init': {
      const target = args[1] || process.cwd()
      const created = initHicodeHome(target)
      process.stdout.write(created.length ? `.hicode/ provisionado em ${target}:\n${created.map(c => `  + ${c}`).join('\n')}\n` : `.hicode/ ja existe em ${target}\n`)
      return 0
    }
    case 'hooks':
      return hooks()
    default:
      usage()
      return cmd ? 1 : 0
  }
}

const code = await main()
if (code >= 0) process.exit(code)
