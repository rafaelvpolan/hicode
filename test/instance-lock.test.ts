import { test, expect, afterAll } from 'bun:test'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { acquireInstanceLock, holdInstanceLock, releaseInstanceLock } from '../lib/runner/instance-lock'
import { daemonPid } from '../lib/core/daemon'

const ROOT = join(import.meta.dir, '..')
const RUNNER = join(ROOT, 'runner.ts')
const BASE = mkdtempSync(join(tmpdir(), 'hicode-instance-lock-'))
const CARDS = mkdtempSync(join(tmpdir(), 'hicode-instance-lock-cards-'))

const MOTOR_FALSO = join(BASE, 'runner.ts')
writeFileSync(MOTOR_FALSO, 'setInterval(() => { void 0 }, 1000)\n')

const motor = spawn('bun', [MOTOR_FALSO], { stdio: 'ignore' })
const PID_MOTOR = motor.pid ?? 0

const alheio = spawn('sleep', ['60'], { stdio: 'ignore' })
const PID_ALHEIO = alheio.pid ?? 0

const menciona = spawn('tail', ['-f', MOTOR_FALSO], { stdio: 'ignore' })
const PID_MENCIONA = menciona.pid ?? 0

const pidfileOriginal = process.env.HICODE_RUNNER_PIDFILE

function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterAll(() => {
  motor.kill('SIGKILL')
  alheio.kill('SIGKILL')
  menciona.kill('SIGKILL')
  if (pidfileOriginal === undefined) delete process.env.HICODE_RUNNER_PIDFILE
  else process.env.HICODE_RUNNER_PIDFILE = pidfileOriginal
  rmSync(BASE, { recursive: true, force: true })
  rmSync(CARDS, { recursive: true, force: true })
})

let seq = 0

function lockfileDeTeste(): string {
  return join(BASE, `runner-${++seq}.lock`)
}

function pidMorto(): number {
  const r = spawnSync('bash', ['-c', 'echo $$'], { encoding: 'utf8' })
  return Number(String(r.stdout).trim())
}

function rodarRunner(args: string[], lockfile: string): { status: number; stderr: string } {
  const r = spawnSync('bun', [RUNNER, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      HICODE_CARDS_DIR: CARDS,
      HICODE_REPOS_FILE: join(BASE, 'repos.json'),
      HICODE_RUNNER_LOCK: lockfile,
    },
    encoding: 'utf8',
    timeout: 20000,
  })
  return { status: r.status ?? -1, stderr: String(r.stderr ?? '') }
}

function esperarArquivo(caminho: string, limiteMs: number): Promise<boolean> {
  const fim = Date.now() + limiteMs
  return new Promise(resolve => {
    const olhar = (): void => {
      if (existsSync(caminho)) return resolve(true)
      if (Date.now() > fim) return resolve(false)
      setTimeout(olhar, 5)
    }
    olhar()
  })
}

function esperarDaemon(limiteMs: number): Promise<number> {
  const fim = Date.now() + limiteMs
  return new Promise(resolve => {
    const olhar = (): void => {
      const pid = daemonPid()
      if (pid || Date.now() > fim) return resolve(pid)
      setTimeout(olhar, 5)
    }
    olhar()
  })
}

test('segunda aquisicao com o motor dono ainda vivo e recusada e denuncia o pid que segura a trava', () => {
  const lockfile = lockfileDeTeste()
  writeFileSync(lockfile, `${PID_MOTOR}\n`)

  const trava = acquireInstanceLock(lockfile)

  expect(trava.acquired).toBe(false)
  expect(trava.holder).toBe(PID_MOTOR)
  expect(Number(readFileSync(lockfile, 'utf8').trim())).toBe(PID_MOTOR)
})

test('REGRESSAO: pid vivo que NAO e motor (reciclado pelo kernel) e retomado — antes travava o motor para sempre', () => {
  const lockfile = lockfileDeTeste()
  writeFileSync(lockfile, `${PID_ALHEIO}\n`)

  const trava = acquireInstanceLock(lockfile)

  expect(trava.acquired).toBe(true)
  expect(trava.holder).toBe(process.pid)
  expect(Number(readFileSync(lockfile, 'utf8').trim())).toBe(process.pid)
  releaseInstanceLock(lockfile)
})

test('REGRESSAO: pid vivo que apenas MENCIONA runner.ts na linha de comando nao segura a trava — so bun rodando runner.ts segura', () => {
  const lockfile = lockfileDeTeste()
  expect(vivo(PID_MENCIONA)).toBe(true)
  writeFileSync(lockfile, `${PID_MENCIONA}\n`)

  const trava = acquireInstanceLock(lockfile)

  expect(trava.acquired).toBe(true)
  expect(trava.holder).toBe(process.pid)
  expect(Number(readFileSync(lockfile, 'utf8').trim())).toBe(process.pid)
  releaseInstanceLock(lockfile)
})

test('lock orfao de processo morto e retomado em vez de travar o motor para sempre', () => {
  const lockfile = lockfileDeTeste()
  writeFileSync(lockfile, `${pidMorto()}\n`)

  const trava = acquireInstanceLock(lockfile)

  expect(trava.acquired).toBe(true)
  expect(trava.holder).toBe(process.pid)
  expect(Number(readFileSync(lockfile, 'utf8').trim())).toBe(process.pid)
  releaseInstanceLock(lockfile)
})

test('liberacao devolve o lock: o arquivo some e a proxima aquisicao passa', () => {
  const lockfile = lockfileDeTeste()
  expect(acquireInstanceLock(lockfile).acquired).toBe(true)
  expect(acquireInstanceLock(lockfile).acquired).toBe(true)

  releaseInstanceLock(lockfile)
  expect(existsSync(lockfile)).toBe(false)

  const depois = acquireInstanceLock(lockfile)
  expect(depois.acquired).toBe(true)
  expect(depois.holder).toBe(process.pid)
  releaseInstanceLock(lockfile)
})

test('liberacao nao apaga a trava de outro motor vivo', () => {
  const lockfile = lockfileDeTeste()
  writeFileSync(lockfile, `${PID_MOTOR}\n`)

  releaseInstanceLock(lockfile)

  expect(existsSync(lockfile)).toBe(true)
})

test('REGRESSAO: a trava nao e o pidfile do daemon — segurar a trava nao faz "hii start" enxergar um daemon online', () => {
  const lockfile = lockfileDeTeste()
  const pidfile = join(BASE, `daemon-${seq}.pid`)
  process.env.HICODE_RUNNER_PIDFILE = pidfile
  process.env.HICODE_RUNNER_LOCK = lockfile
  try {
    expect(holdInstanceLock().acquired).toBe(true)

    expect(existsSync(lockfile)).toBe(true)
    expect(existsSync(pidfile)).toBe(false)
    expect(daemonPid()).toBe(0)
  } finally {
    releaseInstanceLock(lockfile)
    delete process.env.HICODE_RUNNER_LOCK
  }
})

test('REGRESSAO: pidfile com pid vivo que NAO e o motor deste clone nao faz a sessao enxergar daemon online', async () => {
  const pidfile = join(BASE, `daemon-alheio-${++seq}.pid`)
  process.env.HICODE_RUNNER_PIDFILE = pidfile
  const motorDaRaiz = spawn('bun', [MOTOR_FALSO], { cwd: ROOT, stdio: 'ignore' })
  try {
    writeFileSync(pidfile, `${PID_ALHEIO}\n`)

    expect(daemonPid()).toBe(0)

    writeFileSync(pidfile, `${motorDaRaiz.pid ?? 0}\n`)
    expect(await esperarDaemon(5000)).toBe(motorDaRaiz.pid)
  } finally {
    motorDaRaiz.kill('SIGKILL')
  }
})

test('REGRESSAO: a trava nunca existe vazia — quem chega no meio da criacao le o dono, nao um arquivo em branco', async () => {
  const lockfile = lockfileDeTeste()
  const parar = `${lockfile}.parar`
  const pronto = `${lockfile}.pronto`
  const saida = `${lockfile}.vazios`
  const espia = join(BASE, `espia-${seq}.ts`)
  writeFileSync(espia, [
    "import { existsSync, readFileSync, writeFileSync } from 'node:fs'",
    'const lock = process.argv[2] ?? String()',
    'const parar = process.argv[3] ?? String()',
    'const pronto = process.argv[4] ?? String()',
    'const saida = process.argv[5] ?? String()',
    "writeFileSync(pronto, 'ok')",
    'let vazios = 0',
    'while (!existsSync(parar)) {',
    "  try { if (readFileSync(lock, 'utf8').trim() === '') vazios++ } catch { void 0 }",
    '}',
    'writeFileSync(saida, String(vazios))',
    '',
  ].join('\n'))

  const observador = spawn('bun', [espia, lockfile, parar, pronto, saida], { stdio: 'ignore' })
  try {
    expect(await esperarArquivo(pronto, 15000)).toBe(true)
    for (let i = 0; i < 3000; i++) {
      acquireInstanceLock(lockfile)
      releaseInstanceLock(lockfile)
    }
    writeFileSync(parar, 'ok')
    expect(await esperarArquivo(saida, 15000)).toBe(true)
    expect(Number(readFileSync(saida, 'utf8').trim())).toBe(0)
  } finally {
    observador.kill('SIGKILL')
  }
}, 40000)

test('REGRESSAO: "runner.ts --once" recusa despachar card quando outro motor ja segura a trava (antes subiam dois motores nos mesmos cards)', () => {
  const lockfile = lockfileDeTeste()
  writeFileSync(lockfile, `${PID_MOTOR}\n`)

  const r = rodarRunner(['--once'], lockfile)

  expect(r.status).not.toBe(0)
  expect(r.stderr).toContain(String(PID_MOTOR))
  expect(Number(readFileSync(lockfile, 'utf8').trim())).toBe(PID_MOTOR)
}, 30000)

test('"runner.ts --status" nao despacha card, entao a trava de outro motor nao o bloqueia', () => {
  const lockfile = lockfileDeTeste()
  writeFileSync(lockfile, `${PID_MOTOR}\n`)

  expect(rodarRunner(['--status'], lockfile).status).toBe(0)
}, 30000)
