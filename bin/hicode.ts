#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProgress } from '../lib/runner/progress'
import { initHicodeHome } from '../lib/runner/hicode-home'
import { runSync } from '../lib/tasks/sync'
import { taskSyncName } from '../lib/tasks/registry'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DAEMON = join(ROOT, 'scripts', 'runner-daemon.sh')
const [cmd, arg] = process.argv.slice(2)

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
    '',
  ].join('\n'))
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
      const target = arg || process.cwd()
      const created = initHicodeHome(target)
      process.stdout.write(created.length ? `.hicode/ provisionado em ${target}:\n${created.map(c => `  + ${c}`).join('\n')}\n` : `.hicode/ ja existe em ${target}\n`)
      return 0
    }
    default:
      usage()
      return cmd ? 1 : 0
  }
}

const code = await main()
if (code >= 0) process.exit(code)
