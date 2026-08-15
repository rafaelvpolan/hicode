import { statSync } from 'node:fs'

export function memoTempo<T>(fn: () => T, ms: number, agora: () => number = Date.now): () => T {
  let valor: T | undefined
  let quando = -Infinity
  return (): T => {
    const t = agora()
    if (valor === undefined || t - quando >= ms) {
      valor = fn()
      quando = t
    }
    return valor
  }
}

function assinatura(arquivo: string): string {
  try {
    const s = statSync(arquivo)
    return `${s.ino}:${s.mtimeMs}:${s.size}`
  } catch {
    return ''
  }
}

export function memoArquivo<T>(arquivoDe: (chave: string) => string, fn: (chave: string) => T): (chave: string) => T {
  const cache = new Map<string, { assinatura: string; valor: T }>()
  return (chave: string): T => {
    const atual = assinatura(arquivoDe(chave))
    const guardado = cache.get(chave)
    if (guardado && guardado.assinatura === atual) return guardado.valor
    const valor = fn(chave)
    cache.set(chave, { assinatura: atual, valor })
    return valor
  }
}

export function memoChave<T>(chaveDe: () => string, fn: () => T): () => T {
  let chave = ''
  let valor: T | undefined
  return (): T => {
    const atual = chaveDe()
    if (valor === undefined || atual !== chave) {
      valor = fn()
      chave = atual
    }
    return valor
  }
}
