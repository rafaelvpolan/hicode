export type Tom =
  | 'sucesso' | 'atencao' | 'falha' | 'execucao' | 'espera'
  | 'custo' | 'ocioso' | 'destaque' | 'apagado' | 'texto'

export interface Rgb {
  r: number
  g: number
  b: number
}

const RESET = '\x1b[0m'

const TONS: Record<Tom, Rgb> = {
  sucesso: { r: 74, g: 222, b: 128 },
  atencao: { r: 251, g: 191, b: 36 },
  falha: { r: 248, g: 113, b: 113 },
  execucao: { r: 34, g: 211, b: 238 },
  espera: { r: 167, g: 139, b: 250 },
  custo: { r: 244, g: 114, b: 182 },
  ocioso: { r: 148, g: 163, b: 184 },
  destaque: { r: 125, g: 211, b: 252 },
  apagado: { r: 100, g: 116, b: 139 },
  texto: { r: 226, g: 232, b: 240 },
}

const ANSI_BASICO: Record<Tom, string> = {
  sucesso: '\x1b[32m',
  atencao: '\x1b[33m',
  falha: '\x1b[31m',
  execucao: '\x1b[36m',
  espera: '\x1b[35m',
  custo: '\x1b[35m',
  ocioso: '\x1b[90m',
  destaque: '\x1b[36m',
  apagado: '\x1b[2m',
  texto: '',
}

export type Profundidade = 'truecolor' | '256' | 'basico' | 'nenhuma'

export function profundidadeDeCor(env: Record<string, string | undefined> = process.env): Profundidade {
  if (env.NO_COLOR) return 'nenhuma'
  const forcado = env.HICODE_COLOR_DEPTH
  if (forcado === 'truecolor' || forcado === '256' || forcado === 'basico' || forcado === 'nenhuma') return forcado
  const colorterm = (env.COLORTERM ?? '').toLowerCase()
  if (colorterm.includes('truecolor') || colorterm.includes('24bit')) return 'truecolor'
  if (env.WT_SESSION || env.KITTY_WINDOW_ID || env.GHOSTTY_RESOURCES_DIR) return 'truecolor'
  if ((env.TERM_PROGRAM ?? '') === 'iTerm.app' || (env.TERM_PROGRAM ?? '') === 'WezTerm') return 'truecolor'
  if ((env.TERM ?? '').includes('256')) return '256'
  if ((env.TERM ?? '') === 'dumb' || !env.TERM) return 'nenhuma'
  return 'basico'
}

export function corDoCubo(c: Rgb): number {
  const eixo = (v: number): number => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.round((v - 35) / 40)))
  return 16 + 36 * eixo(c.r) + 6 * eixo(c.g) + eixo(c.b)
}

export function sequenciaDe(c: Rgb, profundidade: Profundidade): string {
  if (profundidade === 'truecolor') return `\x1b[38;2;${c.r};${c.g};${c.b}m`
  if (profundidade === '256') return `\x1b[38;5;${corDoCubo(c)}m`
  return ''
}

export interface OpcoesTinta {
  color: boolean
  profundidade?: Profundidade
}

export function tom(nome: Tom, o: OpcoesTinta): string {
  if (!o.color) return ''
  const p = o.profundidade ?? profundidadeDeCor()
  if (p === 'nenhuma') return ''
  if (p === 'basico') return ANSI_BASICO[nome]
  return sequenciaDe(TONS[nome], p)
}

export function pintar(texto: string, nome: Tom, o: OpcoesTinta): string {
  if (!o.color || !texto) return texto
  const seq = tom(nome, o)
  return seq ? `${seq}${texto}${RESET}` : texto
}

export function rgbDoTom(nome: Tom): Rgb {
  return TONS[nome]
}

export function interpolar(de: Rgb, para: Rgb, fracao: number): Rgb {
  const f = Math.max(0, Math.min(1, fracao))
  return {
    r: Math.round(de.r + (para.r - de.r) * f),
    g: Math.round(de.g + (para.g - de.g) * f),
    b: Math.round(de.b + (para.b - de.b) * f),
  }
}

export function rampa(de: Tom, para: Tom, passos: number): Rgb[] {
  const n = Math.max(1, Math.floor(passos))
  if (n === 1) return [TONS[de]]
  const a = TONS[de]
  const b = TONS[para]
  return Array.from({ length: n }, (_, i) => interpolar(a, b, i / (n - 1)))
}

export const CANTO = {
  supEsq: '╭',
  supDir: '╮',
  infEsq: '╰',
  infDir: '╯',
  horizontal: '─',
  vertical: '│',
} as const
