import type { H3Event } from 'h3'

const HEARTBEAT_PADRAO_MS = 15000

export interface OpcoesDeTransmissao {
  heartbeatMs?: number
}

export async function transmitirComoSse<T>(
  event: H3Event,
  criarFonte: (signal: AbortSignal) => AsyncIterable<T>,
  opcoes: OpcoesDeTransmissao = {},
): Promise<void> {
  const stream = createEventStream(event)
  const controller = new AbortController()
  stream.onClosed(() => controller.abort())

  const heartbeat = setInterval(() => {
    void stream.push({ event: 'heartbeat', data: '' })
  }, opcoes.heartbeatMs ?? HEARTBEAT_PADRAO_MS)

  const consumir = async (): Promise<void> => {
    try {
      for await (const item of criarFonte(controller.signal)) {
        await stream.push({ event: 'evento', data: JSON.stringify(item) })
      }
    } catch {
      void 0
    } finally {
      clearInterval(heartbeat)
      await stream.close()
    }
  }

  void consumir()
  return stream.send()
}
