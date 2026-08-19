import { test, expect, afterAll } from 'bun:test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { daemonPid, rootFile } from '../lib/core/daemon'
import { ROOT } from '../lib/runner/config'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-daemon-cross-root-'))
const RAIZ_DO_MOTOR = join(BASE, 'raiz-do-motor-em-outro-clone')
mkdirSync(RAIZ_DO_MOTOR, { recursive: true })
const MOTOR_FALSO = join(RAIZ_DO_MOTOR, 'runner.ts')
writeFileSync(MOTOR_FALSO, 'setInterval(() => { void 0 }, 1000)\n')

const motor = spawn('bun', [MOTOR_FALSO], { cwd: RAIZ_DO_MOTOR, stdio: 'ignore' })
const PID_MOTOR = motor.pid ?? 0

const motorDentroDoRoot = spawn('bun', [MOTOR_FALSO], { cwd: ROOT, stdio: 'ignore' })
const PID_MOTOR_DENTRO_DO_ROOT = motorDentroDoRoot.pid ?? 0

const pidfileOriginal = process.env.HICODE_RUNNER_PIDFILE

afterAll(() => {
  motor.kill('SIGKILL')
  motorDentroDoRoot.kill('SIGKILL')
  if (pidfileOriginal === undefined) delete process.env.HICODE_RUNNER_PIDFILE
  else process.env.HICODE_RUNNER_PIDFILE = pidfileOriginal
  rmSync(BASE, { recursive: true, force: true })
})

test('pre-condicao: os motores falsos de apoio ao teste subiram de verdade — sem isso as asserções abaixo passariam vazias', () => {
  expect(PID_MOTOR).toBeGreaterThan(0)
  expect(PID_MOTOR_DENTRO_DO_ROOT).toBeGreaterThan(0)
})

test('REGRESSAO: a raiz gravada no sidecar do pidfile prova o daemon mesmo quando o cwd do pid difere do ROOT de quem pergunta', () => {
  const pidfile = join(BASE, 'motor-de-outra-raiz.pid')
  process.env.HICODE_RUNNER_PIDFILE = pidfile
  writeFileSync(pidfile, `${PID_MOTOR}\n`)
  writeFileSync(rootFile(), `${RAIZ_DO_MOTOR}\n`)

  expect(RAIZ_DO_MOTOR).not.toBe(ROOT)
  expect(daemonPid()).toBe(PID_MOTOR)
})

test('registro cujo sidecar aponta para uma raiz que nao bate com o cwd real do pid e recusado — nao basta declarar, tem de provar', () => {
  const pidfile = join(BASE, 'motor-com-raiz-falsa.pid')
  process.env.HICODE_RUNNER_PIDFILE = pidfile
  writeFileSync(pidfile, `${PID_MOTOR}\n`)
  writeFileSync(rootFile(), `${join(BASE, 'raiz-inventada-que-nao-e-o-cwd-real')}\n`)

  expect(daemonPid()).toBe(0)
})

test('sem sidecar de raiz (pidfile legado), a prova cai no comportamento de hoje: compara com o ROOT de quem pergunta', () => {
  const pidfile = join(BASE, 'motor-legado.pid')
  process.env.HICODE_RUNNER_PIDFILE = pidfile
  writeFileSync(pidfile, `${PID_MOTOR_DENTRO_DO_ROOT}\n`)

  expect(daemonPid()).toBe(PID_MOTOR_DENTRO_DO_ROOT)
})

test('sem sidecar de raiz, um pid vivo fora do ROOT de quem pergunta continua recusado (nao regrediu a seguranca de hoje)', () => {
  const pidfile = join(BASE, 'motor-legado-fora-do-root.pid')
  process.env.HICODE_RUNNER_PIDFILE = pidfile
  writeFileSync(pidfile, `${PID_MOTOR}\n`)

  expect(daemonPid()).toBe(0)
})
