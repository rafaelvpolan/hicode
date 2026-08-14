const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'

export const CORES_DE_PROJETO = [
  '\x1b[36m',
  '\x1b[35m',
  '\x1b[32m',
  '\x1b[33m',
  '\x1b[34m',
  '\x1b[31m',
]

export function corDoProjeto(repo: string, indice = -1): string {
  if (indice >= 0) return CORES_DE_PROJETO[indice % CORES_DE_PROJETO.length] ?? CORES_DE_PROJETO[0] ?? ''
  let soma = 0
  for (const c of repo) soma = (soma + c.charCodeAt(0)) % 997
  return CORES_DE_PROJETO[soma % CORES_DE_PROJETO.length] ?? CORES_DE_PROJETO[0] ?? ''
}

export function nomeCurto(repo: string): string {
  return repo.split('/').pop() || repo
}

export interface EtiquetaOptions {
  color: boolean
  indice: number
  detalhe: string
}

export function etiquetaDoProjeto(repo: string, opts: Partial<EtiquetaOptions> = {}): string {
  const o = { color: false, indice: -1, detalhe: '', ...opts }
  if (!repo) return o.color ? `${DIM}sem projeto — /repo escolhe${RESET}` : 'sem projeto — /repo escolhe'
  const cor = corDoProjeto(repo, o.indice)
  const nome = nomeCurto(repo)
  const marca = o.color ? `${cor}●${RESET} ${cor}${BOLD}${nome}${RESET}` : `● ${nome}`
  const dono = repo.includes('/') ? (o.color ? `${DIM} ${repo.split('/')[0]}${RESET}` : ` ${repo.split('/')[0]}`) : ''
  const extra = o.detalhe ? (o.color ? `${DIM}  ${o.detalhe}${RESET}` : `  ${o.detalhe}`) : ''
  return `${marca}${dono}${extra}`
}
