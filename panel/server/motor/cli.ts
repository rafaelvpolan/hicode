import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MotorDispatchOptions, MotorDispatchResult, MotorEntrypoint } from './types'
import { hiiHome } from './ambiente'

const TIMEOUT_COMANDO_CURTO_MS = 30000
const PRAZO_PARA_SIGKILL_MS = 5000
const ACOES_PROIBIDAS = ['merge']
const NOME_DO_BINARIO = 'hii'
const ENTRYPOINT_DE_FALLBACK = 'runner.ts'
const RUNTIME_DE_FALLBACK = 'bun'
const COMANDOS_CURTOS_PERMITIDOS = ['--init', '--sync', '--status']
const COMANDOS_LONGOS_PERMITIDOS = ['--once']
const COMANDOS_PONTUAIS_PERMITIDOS = [...COMANDOS_CURTOS_PERMITIDOS, ...COMANDOS_LONGOS_PERMITIDOS]

function contemAcaoProibida(args: string[]): boolean {
  return args.some(a => ACOES_PROIBIDAS.includes(a.toLowerCase()))
}

function ehComandoPontualPermitido(args: string[]): boolean {
  const [primeiro] = args
  if (!primeiro || !COMANDOS_PONTUAIS_PERMITIDOS.includes(primeiro)) return false
  return !args.includes('--watch')
}

function comandoNaoPontual(args: string[]): MotorDispatchResult {
  return {
    ok: false,
    exitCode: null,
    timedOut: false,
    stdout: '',
    stderr: `dispatch() so aceita comando pontual (${COMANDOS_PONTUAIS_PERMITIDOS.join(', ')}) sem --watch; ${JSON.stringify(args)} cairia no daemon completo do motor`,
  }
}

function comandoLongoExigeTimeoutExplicito(args: string[]): boolean {
  const [primeiro] = args
  return COMANDOS_LONGOS_PERMITIDOS.includes(primeiro ?? '')
}

function timeoutExplicitoObrigatorio(args: string[]): MotorDispatchResult {
  return {
    ok: false,
    exitCode: null,
    timedOut: false,
    stdout: '',
    stderr: `${JSON.stringify(args)} roda o pipeline de polimento inteiro do card (varios passos gated, cada um com reajustes e chamadas de IA de ate 900000ms cada, ate abrir o PR) — nao existe timeout padrao seguro; quem despacha precisa passar timeoutMs explicitamente, escolhido para o tamanho real do trabalho`,
  }
}

function binarioNoPath(): string | null {
  const diretorios = (process.env.PATH ?? '').split(':').filter(Boolean)
  return diretorios.map(d => join(d, NOME_DO_BINARIO)).find(existsSync) ?? null
}

function runnerTsEmHiiHome(): string | null {
  const caminho = join(hiiHome(), ENTRYPOINT_DE_FALLBACK)
  return existsSync(caminho) ? caminho : null
}

export function resolverEntrypoint(): MotorEntrypoint | null {
  const bin = binarioNoPath()
  if (bin) return { runtime: bin, args: [], origem: 'path' }
  const runner = runnerTsEmHiiHome()
  if (runner) return { runtime: RUNTIME_DE_FALLBACK, args: [runner], origem: 'hii-home' }
  return null
}

function motorNaoEncontrado(): MotorDispatchResult {
  return {
    ok: false,
    exitCode: null,
    timedOut: false,
    stdout: '',
    stderr: `motor nao encontrado: nem "${NOME_DO_BINARIO}" no PATH, nem "${ENTRYPOINT_DE_FALLBACK}" em ${hiiHome()}`,
  }
}

function matarGrupoDoProcesso(pid: number, sinal: NodeJS.Signals): void {
  try {
    process.kill(-pid, sinal)
  } catch {
    void 0
  }
}

export function dispatch(args: string[], options: MotorDispatchOptions = {}): Promise<MotorDispatchResult> {
  if (contemAcaoProibida(args)) {
    return Promise.resolve({ ok: false, exitCode: null, timedOut: false, stdout: '', stderr: 'acao proibida: merge e sempre humano' })
  }
  if (!ehComandoPontualPermitido(args)) return Promise.resolve(comandoNaoPontual(args))
  if (comandoLongoExigeTimeoutExplicito(args) && options.timeoutMs === undefined) {
    return Promise.resolve(timeoutExplicitoObrigatorio(args))
  }
  const entrypoint = resolverEntrypoint()
  if (!entrypoint) return Promise.resolve(motorNaoEncontrado())
  const timeoutMs = options.timeoutMs ?? TIMEOUT_COMANDO_CURTO_MS
  const prazoParaSigkillMs = options.sigkillGraceMs ?? PRAZO_PARA_SIGKILL_MS
  return new Promise(resolve => {
    const child = spawn(entrypoint.runtime, [...entrypoint.args, ...args], { cwd: hiiHome(), env: process.env, detached: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let escalada: ReturnType<typeof setTimeout> | null = null
    const encerrarTimers = (): void => {
      clearTimeout(timer)
      if (escalada) clearTimeout(escalada)
    }
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid) matarGrupoDoProcesso(child.pid, 'SIGTERM')
      escalada = setTimeout(() => {
        if (child.pid) matarGrupoDoProcesso(child.pid, 'SIGKILL')
      }, prazoParaSigkillMs)
    }, timeoutMs)
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('close', exitCode => {
      encerrarTimers()
      resolve({ ok: exitCode === 0 && !timedOut, exitCode, timedOut, stdout, stderr })
    })
    child.on('error', erro => {
      encerrarTimers()
      resolve({ ok: false, exitCode: null, timedOut: false, stdout, stderr: String(erro) })
    })
  })
}
