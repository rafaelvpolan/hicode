import { expect, test } from 'bun:test'
import { rotuloDaEtapa } from '../panel/shared/observabilidade'

test('eventos semanticos do motor recebem rotulos legiveis sem perder a ferramenta', () => {
  expect(rotuloDaEtapa('modelo_verificado')).toBe('modelo e ferramentas verificados')
  expect(rotuloDaEtapa('inferencia_inicio')).toBe('inferência em andamento')
  expect(rotuloDaEtapa('ferramenta_inicio', { ferramenta: 'replace_text' })).toBe('ferramenta em execução: replace_text')
  expect(rotuloDaEtapa('etapa-legada')).toBe('etapa-legada')
})
