const TTL_MS = 5000
const TIMEOUT_MS = 400

export interface EstadoDoOllama {
  habilitado: boolean
  modelos: string[]
  verificadoEm: number
}

let cache: EstadoDoOllama = { habilitado: false, modelos: [], verificadoEm: 0 }
let emVoo = false

export function urlDoOllama(): string {
  return process.env.HICODE_OLLAMA_URL || 'http://127.0.0.1:11434'
}

interface TagsDoOllama {
  models?: { name?: string }[]
}

export async function sondarOllama(agoraMs: number = Date.now()): Promise<EstadoDoOllama> {
  try {
    const r = await fetch(`${urlDoOllama()}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return { habilitado: false, modelos: [], verificadoEm: agoraMs }
    const j = (await r.json()) as TagsDoOllama
    const modelos = (j.models ?? []).map(m => m.name ?? '').filter(Boolean)
    return { habilitado: true, modelos, verificadoEm: agoraMs }
  } catch {
    return { habilitado: false, modelos: [], verificadoEm: agoraMs }
  }
}

export function estadoDoOllama(agoraMs: number = Date.now()): EstadoDoOllama {
  if (!emVoo && agoraMs - cache.verificadoEm > TTL_MS) {
    emVoo = true
    void sondarOllama(agoraMs).then(novo => { cache = novo }).finally(() => { emVoo = false })
  }
  return cache
}

export function definirEstadoDoOllama(novo: EstadoDoOllama): void {
  cache = novo
}
