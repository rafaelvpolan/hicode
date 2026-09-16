export interface ArmazenamentoDeIntencao {
  getItem(chave: string): string | null
  setItem(chave: string, valor: string): void
  removeItem(chave: string): void
}
export interface PedidoDoPainel { texto: string; modo: 'gateway' | 'orquestrador' | 'ask'; sessao: string }
export interface IntencaoDePedido { versao: 1; pedido: PedidoDoPainel; chaveSessao: string; chavePedido: string; sessao: string }
export interface ComandoDoPainel { acao: string; texto: string; chave: string; id?: string; modo?: 'gateway' | 'orquestrador' }
export interface ResultadoDoPedido { id: string; status?: string }
export function chaveDeIntencao(repo: string): string { return `hicode:pedido:v1:${repo}` }
export function lerIntencao(storage: ArmazenamentoDeIntencao, repo: string): IntencaoDePedido | null {
  const valor = storage.getItem(chaveDeIntencao(repo))
  if (!valor) return null
  const i = JSON.parse(valor) as IntencaoDePedido
  if (i.versao !== 1 || !i.pedido || typeof i.pedido.texto !== 'string' ||
    !['gateway', 'orquestrador', 'ask'].includes(i.pedido.modo) || typeof i.pedido.sessao !== 'string' ||
    typeof i.sessao !== 'string' || !/^[a-zA-Z0-9-]{8,128}$/.test(i.chavePedido) || !/^[a-zA-Z0-9-]{8,128}$/.test(i.chaveSessao)) {
    throw new Error('Intencao armazenada invalida. Reconcilie o pedido com o motor.')
  }
  return i
}
const emVoo = new Set<string>()
export async function enviarIntencao(
  storage: ArmazenamentoDeIntencao, repo: string, pedido: PedidoDoPainel,
  enviar: (comando: ComandoDoPainel) => Promise<ResultadoDoPedido>,
  novaChave: () => string = () => crypto.randomUUID(),
): Promise<ResultadoDoPedido & { sessao: string }> {
  const chave = chaveDeIntencao(repo)
  if (!repo || !pedido.texto.trim()) throw new Error('Projeto e pedido obrigatorios')
  if (emVoo.has(chave)) throw new Error('Pedido ja esta sendo enviado')
  emVoo.add(chave)
  try {
    const anterior = lerIntencao(storage, repo)
    if (anterior && JSON.stringify(anterior.pedido) !== JSON.stringify(pedido)) throw new Error('Existe um pedido sem confirmacao. Retome a intencao original antes de criar outra.')
    const i: IntencaoDePedido = anterior ?? { versao: 1, pedido: { ...pedido }, chaveSessao: novaChave(), chavePedido: novaChave(), sessao: pedido.sessao }
    storage.setItem(chave, JSON.stringify(i))
    if (pedido.modo !== 'ask' && !i.sessao) {
      i.sessao = (await enviar({ acao: 'nova_sessao', texto: 'Sessao Hicode', chave: i.chaveSessao })).id
      storage.setItem(chave, JSON.stringify(i))
    }
    const r = await enviar(pedido.modo === 'ask'
      ? { acao: 'perguntar', texto: pedido.texto, chave: i.chavePedido }
      : { acao: 'pedido', id: i.sessao, texto: pedido.texto, modo: pedido.modo, chave: i.chavePedido })
    storage.removeItem(chave)
    return { ...r, sessao: i.sessao }
  } finally { emVoo.delete(chave) }
}
