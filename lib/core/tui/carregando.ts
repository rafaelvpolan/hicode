import { interpolar, rgbDoTom, sequenciaDe, profundidadeDeCor } from './paleta'
import type { Profundidade, Tom } from './paleta'

const RESET = '\x1b[0m'
const BLOCOS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const PULSO = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export interface OpcoesCarregando {
  color: boolean
  largura: number
  profundidade?: Profundidade
  de?: Tom
  para?: Tom
}

export function quadroDoPulso(tick: number): string {
  const i = ((Math.floor(tick) % PULSO.length) + PULSO.length) % PULSO.length
  return PULSO[i] ?? PULSO[0] ?? ''
}

export function pulso(tick: number, o: OpcoesCarregando): string {
  const q = quadroDoPulso(tick)
  if (!o.color) return q
  const p = o.profundidade ?? profundidadeDeCor()
  if (p === 'nenhuma' || p === 'basico') return q
  const fase = (Math.floor(tick) % PULSO.length) / PULSO.length
  const cor = interpolar(rgbDoTom(o.de ?? 'execucao'), rgbDoTom(o.para ?? 'espera'), fase)
  return `${sequenciaDe(cor, p)}${q}${RESET}`
}

function celulasCheias(fracao: number, largura: number): { cheias: number; resto: number } {
  const total = Math.max(0, Math.min(1, fracao)) * largura
  const cheias = Math.floor(total)
  return { cheias, resto: total - cheias }
}

export function barraGradiente(fracao: number, o: OpcoesCarregando): string {
  const largura = Math.max(1, Math.floor(o.largura))
  const { cheias, resto } = celulasCheias(fracao, largura)
  const p = o.profundidade ?? profundidadeDeCor()
  const gradiente = o.color && (p === 'truecolor' || p === '256')
  const de = rgbDoTom(o.de ?? 'execucao')
  const para = rgbDoTom(o.para ?? 'sucesso')
  let saida = ''
  for (let i = 0; i < cheias; i++) {
    const cor = interpolar(de, para, largura === 1 ? 1 : i / (largura - 1))
    saida += gradiente ? `${sequenciaDe(cor, p)}█` : '█'
  }
  if (cheias < largura) {
    const parcial = resto > 0 ? BLOCOS[Math.min(BLOCOS.length - 1, Math.floor(resto * BLOCOS.length))] ?? '' : ''
    if (parcial) {
      const cor = interpolar(de, para, largura === 1 ? 1 : cheias / (largura - 1))
      saida += gradiente ? `${sequenciaDe(cor, p)}${parcial}` : parcial
    }
    const vazias = largura - cheias - (parcial ? 1 : 0)
    if (vazias > 0) saida += (gradiente ? `${sequenciaDe(rgbDoTom('apagado'), p)}` : '') + '░'.repeat(vazias)
  }
  return gradiente || (o.color && p === 'basico') ? `${saida}${RESET}` : saida
}

export function ondaDeEspera(tick: number, o: OpcoesCarregando): string {
  const largura = Math.max(1, Math.floor(o.largura))
  const p = o.profundidade ?? profundidadeDeCor()
  const gradiente = o.color && (p === 'truecolor' || p === '256')
  const foco = ((Math.floor(tick) % largura) + largura) % largura
  const de = rgbDoTom(o.de ?? 'apagado')
  const para = rgbDoTom(o.para ?? 'execucao')
  let saida = ''
  for (let i = 0; i < largura; i++) {
    const dist = Math.min(Math.abs(i - foco), largura - Math.abs(i - foco))
    const intensidade = Math.max(0, 1 - dist / 3)
    saida += gradiente ? `${sequenciaDe(interpolar(de, para, intensidade), p)}─` : (intensidade > 0.5 ? '━' : '─')
  }
  return gradiente ? `${saida}${RESET}` : saida
}
