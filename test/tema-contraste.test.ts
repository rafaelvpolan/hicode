import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../panel/app/assets/css/tokens.css', import.meta.url), 'utf8')
function cor(nome: string): number[] {
  const hex = css.match(new RegExp('--' + nome + ': #([a-f0-9]{6});'))?.[1]
  if (!hex) throw new Error('Token ausente: ' + nome)
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
}
function luz(nome: string): number {
  const c = cor(nome).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722
}
test('textos, metadados e estados mantem contraste AA nas superficies do tema', () => {
  for (const fundo of ['fundo', 'superficie', 'superficie-2', 'superficie-3', 'superficie-afundada']) {
    for (const texto of ['texto', 'texto-mudo', 'texto-fraco', 'acento', 'ok', 'atencao', 'falha', 'parado']) {
      const ratio = (luz(texto) + 0.05) / (luz(fundo) + 0.05)
      expect(ratio, texto + ' em ' + fundo).toBeGreaterThanOrEqual(4.5)
    }
  }
})
