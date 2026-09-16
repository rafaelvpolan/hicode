import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
export default defineEventHandler(event => {
  exigirSessao(event)
  const { cliente, repo } = motorHii()
  const res = event.node.res
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' })
  res.write('retry: 1500\n\n')
  const assinatura = cliente.observar({ repo }, p => {
    if (!res.write(`event: snapshot\ndata: ${JSON.stringify({ versao: 1, repo, cursor: p.cursor, degradado: p.degradado, atividades: [...p.atividades.values()] })}\n\n`)) res.end()
  }, () => { if (!res.destroyed) res.write('event: degradado\ndata: {}\n\n') })
  const timer = setInterval(() => { if (!res.write(': heartbeat\n\n')) res.end() }, 15000)
  return new Promise<void>(resolve => res.once('close', () => { clearInterval(timer); assinatura.dispose(); resolve() }))
})
