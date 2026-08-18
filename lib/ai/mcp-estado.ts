export type EstadoServidor = 'conectado' | 'precisa-auth' | 'desconhecido'

export interface ServidorMcp {
  nome: string
  estado: EstadoServidor
}

const RE_AUTH = /needs authentication|not authenticated|unauthorized/i
const RE_OK = /connected/i

export function lerLinhaDeServidor(linha: string): ServidorMcp | null {
  const bruta = linha.trim()
  const separador = bruta.indexOf(': ')
  if (separador === -1) return null
  const nome = bruta.slice(0, separador).trim()
  if (!nome || nome.includes(' - ')) return null
  const cauda = bruta.slice(separador + 2)
  if (RE_AUTH.test(cauda)) return { nome, estado: 'precisa-auth' }
  if (RE_OK.test(cauda)) return { nome, estado: 'conectado' }
  return { nome, estado: 'desconhecido' }
}

export function lerListaDeServidores(saida: string): ServidorMcp[] {
  return saida.split('\n').map(lerLinhaDeServidor).filter((s): s is ServidorMcp => s !== null)
}

export type EscopoServidor = 'dinamico' | 'persistente' | 'nao-verificavel'

export function lerEscopo(saidaDoGet: string): EscopoServidor {
  return /scope:\s*dynamic config/i.test(saidaDoGet) ? 'dinamico' : 'persistente'
}

export interface DisponibilidadeExterna {
  usavel: boolean
  motivo: string
  tools: string[]
}

export interface ConsultaMcp {
  servidores: () => Promise<ServidorMcp[]>
  escopo: (nome: string) => Promise<EscopoServidor>
  prefixo: (nome: string) => string
}

function normalizar(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function combinam(ferramenta: string, nome: string): boolean {
  const alvo = normalizar(ferramenta).trim()
  return !!alvo && normalizar(nome).includes(alvo)
}

export async function disponibilidadeExterna(
  ferramenta: string,
  consulta: ConsultaMcp,
): Promise<DisponibilidadeExterna> {
  const todos = await consulta.servidores()
  const candidatos = todos.filter(s => combinam(ferramenta, s.nome))
  if (!candidatos.length) {
    return { usavel: false, motivo: `nenhum servidor MCP de ${ferramenta} aparece em "claude mcp list"`, tools: [] }
  }
  const conectados = candidatos.filter(s => s.estado === 'conectado')
  if (!conectados.length) {
    return {
      usavel: false,
      motivo: `o conector ${ferramenta} existe mas pede autenticacao — autorize numa sessao interativa (/mcp), o motor nao roda o fluxo OAuth`,
      tools: [],
    }
  }
  const persistentes: string[] = []
  let naoVerificavel = false
  for (const s of conectados) {
    const escopo = await consulta.escopo(s.nome)
    if (escopo === 'persistente') persistentes.push(s.nome)
    if (escopo === 'nao-verificavel') naoVerificavel = true
  }
  if (!persistentes.length) {
    return {
      usavel: false,
      motivo: naoVerificavel
        ? `nao consegui verificar o escopo do conector ${ferramenta} — trato como indisponivel para nao gastar numa capacidade nao confirmada`
        : `o conector ${ferramenta} so existe na sessao interativa (escopo dinamico) — o subprocesso do motor nao o recebe`,
      tools: [],
    }
  }
  return { usavel: true, motivo: '', tools: persistentes.map(consulta.prefixo) }
}
