import { execFile } from 'node:child_process'
import type { EstadoDeServico, StatusDeServico } from '#shared/types'

const TIMEOUT_PADRAO_MS = 5000

export interface ResultadoDeComando {
  ok: boolean
  stdout: string
  stderr: string
}

export function executarComando(comando: string, args: string[], timeoutMs = TIMEOUT_PADRAO_MS): Promise<ResultadoDeComando> {
  return new Promise(resolve => {
    execFile(comando, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (erro, stdout, stderr) => {
      resolve({ ok: !erro, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

export function estadoDeServico(nome: string, estado: EstadoDeServico, detalhe: string, comoResolver = ''): StatusDeServico {
  return { nome, estado, detalhe, comoResolver }
}

function comTimeout<T>(promessa: Promise<T>, ms: number, aoEstourar: () => T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(aoEstourar()), ms)
    promessa.then(v => {
      clearTimeout(timer)
      resolve(v)
    }, () => {
      clearTimeout(timer)
      resolve(aoEstourar())
    })
  })
}

function motivoDoErro(erro: Error): string {
  return erro.message || String(erro)
}

export async function sondarComSeguranca<T>(
  nome: string,
  timeoutMs: number,
  sonda: () => Promise<T>,
  aoFalhar: (motivo: string) => T,
): Promise<T> {
  const executada = sonda().catch((erro: Error) => aoFalhar(`sonda falhou: ${motivoDoErro(erro)}`))
  return comTimeout(executada, timeoutMs, () => aoFalhar(`sonda excedeu ${timeoutMs}ms`))
}

export function sondarStatusUnicoComSeguranca(nome: string, timeoutMs: number, sonda: () => Promise<StatusDeServico>): Promise<StatusDeServico> {
  return sondarComSeguranca(nome, timeoutMs, sonda, motivo => estadoDeServico(nome, 'desconhecido', motivo))
}

export function sondarListaComSeguranca(nome: string, timeoutMs: number, sonda: () => Promise<StatusDeServico[]>): Promise<StatusDeServico[]> {
  return sondarComSeguranca(nome, timeoutMs, sonda, motivo => [estadoDeServico(nome, 'desconhecido', motivo)])
}
