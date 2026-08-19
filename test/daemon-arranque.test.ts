import { test, expect, afterAll } from 'bun:test'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = join(import.meta.dir, '..')
const BASE = mkdtempSync(join(tmpdir(), 'hicode-daemon-arranque-'))
const SCRIPT = join(BASE, 'scripts', 'runner-daemon.sh')
const SEM_PROC = join(BASE, 'scripts', 'sem-proc.sh')
const CARDS = join(BASE, 'cards')

const CLONE_ALHEIO = join(BASE, 'clone-alheio')

mkdirSync(join(BASE, 'scripts'), { recursive: true })
mkdirSync(join(BASE, 'dono'), { recursive: true })
mkdirSync(CLONE_ALHEIO, { recursive: true })
mkdirSync(CARDS, { recursive: true })
symlinkSync(join(REPO, 'scripts', 'runner-daemon.sh'), SCRIPT)
writeFileSync(SEM_PROC, readFileSync(join(REPO, 'scripts', 'runner-daemon.sh'), 'utf8').replaceAll('/proc', '/nao-existe-proc'))

const MOTOR = [
  `import { holdInstanceLock, refusalMessage } from ${JSON.stringify(join(REPO, 'lib', 'runner', 'instance-lock'))}`,
  'const trava = holdInstanceLock()',
  'if (!trava.acquired) {',
  '  process.stderr.write(refusalMessage(trava.holder))',
  '  process.exit(1)',
  '}',
  'setInterval(() => { void 0 }, 1000)',
  '',
].join('\n')
writeFileSync(join(BASE, 'runner.ts'), MOTOR)
writeFileSync(join(BASE, 'dono', 'runner.ts'), 'setInterval(() => { void 0 }, 1000)\n')
writeFileSync(join(CLONE_ALHEIO, 'runner.ts'), 'setInterval(() => { void 0 }, 1000)\n')

const dono = spawn('bun', [join(BASE, 'dono', 'runner.ts')], { stdio: 'ignore' })
const PID_DONO = dono.pid ?? 0
const alheio = spawn('bun', ['runner.ts'], { cwd: CLONE_ALHEIO, stdio: 'ignore' })
const estranho = spawn('sleep', ['300'], { stdio: 'ignore' })
const PID_ESTRANHO = estranho.pid ?? 0
const iniciados: number[] = []

afterAll(() => {
  dono.kill('SIGKILL')
  alheio.kill('SIGKILL')
  estranho.kill('SIGKILL')
  for (const pid of iniciados) {
    try { process.kill(pid, 'SIGKILL') } catch { void 0 }
  }
  rmSync(BASE, { recursive: true, force: true })
})

interface Saida {
  status: number
  stdout: string
  stderr: string
}

function ambiente(nome: string): Record<string, string | undefined> {
  return {
    ...process.env,
    HICODE_RUNNER_LOCK: join(BASE, `${nome}.lock`),
    HICODE_RUNNER_PIDFILE: join(BASE, `${nome}.pid`),
    HICODE_RUNNER_LOG: join(BASE, `${nome}.log`),
    HICODE_CARDS_DIR: CARDS,
    HICODE_REPOS_FILE: join(BASE, 'repos.json'),
  }
}

function correr(script: string, sub: string, nome: string): Saida {
  const r = spawnSync('bash', [script, sub], { env: ambiente(nome), encoding: 'utf8', timeout: 40000 })
  return { status: r.status ?? -1, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') }
}

function daemon(sub: string, nome: string): Saida {
  return correr(SCRIPT, sub, nome)
}

function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function motoresNaRaiz(): number[] {
  const raiz = realpathSync(BASE)
  const achados: number[] = []
  for (const entrada of readdirSync('/proc')) {
    const pid = Number(entrada)
    if (!pid) continue
    try {
      if (realpathSync(`/proc/${pid}/cwd`) !== raiz) continue
      if (readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('runner.ts')) achados.push(pid)
    } catch {
      void 0
    }
  }
  return achados
}

function doisStartsAoMesmoTempo(nome: string): Promise<number[]> {
  const filhos = [0, 1].map(() => spawn('bash', [SCRIPT, 'start'], { env: ambiente(nome), stdio: 'ignore' }))
  return Promise.all(filhos.map(f => new Promise<number>(pronto => { f.on('exit', code => pronto(code ?? -1)) })))
}

test('REGRESSAO: start com a trava tomada por motor vivo sai !=0, aponta o log e NAO deixa pidfile de pid morto', () => {
  const lock = join(BASE, 'tomado.lock')
  const pidfile = join(BASE, 'tomado.pid')
  const log = join(BASE, 'tomado.log')
  writeFileSync(lock, `${PID_DONO}\n`)

  const r = daemon('start', 'tomado')

  expect(r.status).not.toBe(0)
  expect(existsSync(pidfile)).toBe(false)
  expect(r.stderr).toContain(log)
  expect(readFileSync(log, 'utf8')).toContain(`motor ja em execucao (pid ${PID_DONO})`)
})

test('start com a trava livre so declara sucesso depois que o motor sobreviveu ao arranque', () => {
  const lock = join(BASE, 'livre.lock')
  const pidfile = join(BASE, 'livre.pid')

  const r = daemon('start', 'livre')

  expect(r.status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)
  expect(pid).toBeGreaterThan(0)
  expect(vivo(pid)).toBe(true)
  expect(Number(readFileSync(lock, 'utf8').trim())).toBe(pid)
  expect(r.stdout).toContain(`PID ${pid}`)

  const parada = daemon('stop', 'livre')

  expect(parada.status).toBe(0)
  expect(existsSync(pidfile)).toBe(false)
}, 60000)

test('"bun runner.ts" de OUTRO clone nao e adotado como daemon deste ROOT', () => {
  expect(vivo(alheio.pid ?? 0)).toBe(true)

  expect(daemon('status', 'alheio').stdout.trim()).toBe('offline')
})

test('REGRESSAO: pidfile obsoleto com pid RECICLADO por processo alheio nao vira daemon — status offline e stop nao mata o inocente', () => {
  const pidfile = join(BASE, 'reciclado.pid')
  expect(vivo(PID_ESTRANHO)).toBe(true)
  writeFileSync(pidfile, `${PID_ESTRANHO}\n`)

  expect(daemon('status', 'reciclado').stdout.trim()).toBe('offline')

  const parada = daemon('stop', 'reciclado')

  expect(parada.status).toBe(0)
  expect(parada.stdout).toContain('runner ja offline')
  expect(existsSync(pidfile)).toBe(false)
  expect(vivo(PID_ESTRANHO)).toBe(true)
})

test('REGRESSAO: sem /proc o daemon legitimo continua reconhecido pelo PID-file — status online e stop para o motor', () => {
  const pidfile = join(BASE, 'semproc.pid')
  expect(daemon('start', 'semproc').status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)

  expect(correr(SEM_PROC, 'status', 'semproc').stdout).toContain(`online (PID ${pid})`)

  const parada = correr(SEM_PROC, 'stop', 'semproc')

  expect(parada.stdout).toContain(`runner parado (PID ${pid})`)
  expect(vivo(pid)).toBe(false)
  expect(existsSync(pidfile)).toBe(false)
}, 60000)

test('sem /proc a varredura de fallback nao adota bun nenhum: sem PID-file o status e offline, nunca um estranho', () => {
  const pidfile = join(BASE, 'semproc2.pid')
  expect(daemon('start', 'semproc2').status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)
  rmSync(pidfile)

  expect(daemon('status', 'semproc2').stdout).toContain(`online (PID ${pid})`)
  expect(correr(SEM_PROC, 'status', 'semproc2').stdout.trim()).toBe('offline')

  expect(daemon('stop', 'semproc2').status).toBe(0)
  expect(vivo(pid)).toBe(false)
}, 60000)

test('start com o motor ja no ar e o PID-file sumido reescreve o PID-file em vez de virar no-op cego', () => {
  const pidfile = join(BASE, 'cura.pid')
  expect(daemon('start', 'cura').status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)
  rmSync(pidfile)

  const r = daemon('start', 'cura')

  expect(r.stdout).toContain(`runner ja online (PID ${pid})`)
  expect(Number(readFileSync(pidfile, 'utf8').trim())).toBe(pid)

  expect(daemon('stop', 'cura').status).toBe(0)
  expect(vivo(pid)).toBe(false)
}, 60000)

test('REGRESSAO: start que fracassa nao apaga PID-file que nao e dele — so remove o que ele mesmo escreveu', () => {
  const pidfile = join(BASE, 'alheio-pidfile.pid')
  writeFileSync(join(BASE, 'alheio-pidfile.lock'), `${PID_DONO}\n`)
  writeFileSync(pidfile, `${PID_DONO}\n`)

  const r = daemon('start', 'alheio-pidfile')

  expect(r.status).not.toBe(0)
  expect(existsSync(pidfile)).toBe(true)
  expect(readFileSync(pidfile, 'utf8').trim()).toBe(String(PID_DONO))
}, 60000)

test('REGRESSAO: dois "start" concorrentes deixam UM motor vivo e o PID-file apontando para ele — o perdedor nao apaga o pidfile do vencedor', async () => {
  const pidfile = join(BASE, 'corrida.pid')
  const antes = motoresNaRaiz()

  await doisStartsAoMesmoTempo('corrida')

  const novos = motoresNaRaiz().filter(pid => !antes.includes(pid))
  for (const pid of novos) iniciados.push(pid)

  expect(novos.length).toBe(1)
  expect(existsSync(pidfile)).toBe(true)
  const vencedor = novos[0]
  if (vencedor === undefined) throw new Error('nenhum motor novo subiu')
  expect(Number(readFileSync(pidfile, 'utf8').trim())).toBe(vencedor)

  expect(daemon('stop', 'corrida').status).toBe(0)
  expect(motoresNaRaiz().filter(pid => !antes.includes(pid)).length).toBe(0)
}, 60000)

test('REGRESSAO: start com pidfile de pid reciclado sobe o motor de verdade em vez de virar no-op', () => {
  const pidfile = join(BASE, 'reciclado2.pid')
  writeFileSync(pidfile, `${PID_ESTRANHO}\n`)

  const r = daemon('start', 'reciclado2')

  expect(r.status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)
  expect(pid).not.toBe(PID_ESTRANHO)
  expect(vivo(pid)).toBe(true)
  expect(Number(readFileSync(join(BASE, 'reciclado2.lock'), 'utf8').trim())).toBe(pid)

  expect(daemon('stop', 'reciclado2').status).toBe(0)

  expect(vivo(pid)).toBe(false)
  expect(vivo(PID_ESTRANHO)).toBe(true)
}, 60000)

test('REGRESSAO: dois ROOTS diferentes — status consultado por um script de OUTRA raiz ainda reconhece o motor, pois a raiz que vale e a gravada por quem iniciou, nao a de quem pergunta', () => {
  const nome = 'dois-roots'
  const pidfile = join(BASE, `${nome}.pid`)

  const r = daemon('start', nome)

  expect(r.status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)
  expect(vivo(pid)).toBe(true)
  expect(existsSync(`${pidfile}.root`)).toBe(true)

  const outraRaiz = join(BASE, 'outra-raiz-perguntando')
  mkdirSync(join(outraRaiz, 'scripts'), { recursive: true })
  const scriptDeFora = join(outraRaiz, 'scripts', 'runner-daemon.sh')
  symlinkSync(SCRIPT, scriptDeFora)

  const consulta = spawnSync('bash', [scriptDeFora, 'status'], {
    env: { ...process.env, HICODE_RUNNER_PIDFILE: pidfile },
    encoding: 'utf8',
    timeout: 40000,
  })

  expect(String(consulta.stdout)).toContain(`online (PID ${pid})`)

  expect(daemon('stop', nome).status).toBe(0)
  expect(vivo(pid)).toBe(false)
  expect(existsSync(`${pidfile}.root`)).toBe(false)
}, 60000)

test('REGRESSAO: "start" disparado por um script de OUTRA raiz com pidfile compartilhado adota o motor pelo dono_do_pidfile e NAO regrava a raiz provada — as duas raizes continuam vendo o motor online depois', () => {
  const nome = 'start-outra-raiz'
  const pidfile = join(BASE, `${nome}.pid`)

  const r = daemon('start', nome)
  expect(r.status).toBe(0)
  const pid = Number(readFileSync(pidfile, 'utf8').trim())
  iniciados.push(pid)
  expect(vivo(pid)).toBe(true)
  const raizAntes = readFileSync(`${pidfile}.root`, 'utf8')

  const outraRaiz = join(BASE, 'outra-raiz-que-da-start')
  mkdirSync(join(outraRaiz, 'scripts'), { recursive: true })
  const scriptDeFora = join(outraRaiz, 'scripts', 'runner-daemon.sh')
  symlinkSync(SCRIPT, scriptDeFora)

  const startDeFora = spawnSync('bash', [scriptDeFora, 'start'], {
    env: { ...process.env, HICODE_RUNNER_PIDFILE: pidfile },
    encoding: 'utf8',
    timeout: 40000,
  })

  expect(String(startDeFora.stdout)).toContain(`runner ja online (PID ${pid})`)
  expect(readFileSync(`${pidfile}.root`, 'utf8')).toBe(raizAntes)
  expect(daemon('status', nome).stdout).toContain(`online (PID ${pid})`)

  const statusDeFora = spawnSync('bash', [scriptDeFora, 'status'], {
    env: { ...process.env, HICODE_RUNNER_PIDFILE: pidfile },
    encoding: 'utf8',
    timeout: 40000,
  })
  expect(String(statusDeFora.stdout)).toContain(`online (PID ${pid})`)

  expect(daemon('stop', nome).status).toBe(0)
  expect(vivo(pid)).toBe(false)
}, 60000)
