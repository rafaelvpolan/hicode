import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../panel/app/assets/css/tokens.css', import.meta.url), 'utf8')
const cor = (nome: string): string => css.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? ''
const luminancia = (hex: string): number => {
  const canais = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * canais[0]! + 0.7152 * canais[1]! + 0.0722 * canais[2]!
}
const contraste = (a: string, b: string): number => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro! + 0.05) / (escuro! + 0.05)
}

test('textos compartilhados atendem WCAG AA em todas as superficies', () => {
  for (const fundo of ['fundo', 'superficie', 'superficie-2', 'superficie-3', 'superficie-afundada']) {
    for (const texto of ['texto', 'texto-mudo', 'texto-fraco']) expect(contraste(cor(fundo), cor(texto)), `${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5)
  }
})

test('acentos semanticos permanecem legiveis nas superficies de cards', () => {
  for (const fundo of ['superficie', 'superficie-2', 'superficie-3']) {
    for (const texto of ['acento', 'ok', 'atencao', 'falha']) expect(contraste(cor(fundo), cor(texto)), `${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5)
  }
})
