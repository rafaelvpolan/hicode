import { test, expect } from 'bun:test'
import { classifySurface, isNonVisual } from '../lib/runner/classify'

test('conflito de PR -> nao-visual', () => {
  expect(classifySurface('Essa PR esta com conflitos, corrija', '', true).surface).toBe('none')
})

test('"corrija" nao dispara falso-positivo de "cor" (visual)', () => {
  const v = classifySurface('corrija o merge da branch', '', true)
  expect(v.surface).toBe('none')
})

test('mudanca de cor do hero -> visual', () => {
  expect(classifySurface('muda a cor do hero', '', true).surface).toBe('visual')
})

test('refatorar componente -> visual (visual vence empate)', () => {
  expect(classifySurface('refatora o componente do header', '', true).surface).toBe('visual')
})

test('ajustes de backend/endpoint -> nao-visual', () => {
  expect(classifySurface('cria endpoint de login na api', '', true).surface).toBe('none')
})

test('ambiguo sem sinais -> visual (default seguro)', () => {
  expect(classifySurface('ajusta o fluxo de checkout', '', true).surface).toBe('visual')
})

test('repo sem dev server -> nao-visual independente do texto', () => {
  expect(classifySurface('muda a cor do hero', '', false).surface).toBe('none')
})

test('objetivo tambem e considerado', () => {
  expect(classifySurface('tarefa', 'atualizar dependencias e o lockfile', true).surface).toBe('none')
})

test('acentos sao normalizados (pagina)', () => {
  expect(classifySurface('nova página de contato', '', true).surface).toBe('visual')
})

test('isNonVisual: surface "none" pula revalidacao visual (regressao #012)', () => {
  expect(isNonVisual('none')).toBe(true)
})

test('isNonVisual: surface "visual" revalida normalmente', () => {
  expect(isNonVisual('visual')).toBe(false)
})

test('isNonVisual: sem surface definido nao pula (default revalida)', () => {
  expect(isNonVisual(undefined)).toBe(false)
  expect(isNonVisual('')).toBe(false)
})

test('verificacao de pacotes (#012): classifica nao-visual e pula a revalidacao visual', () => {
  const v = classifySurface('verifique se a resolucao de conflito afetou a versao correta dos pacotes', '', true)
  expect(v.surface).toBe('none')
  expect(isNonVisual(v.surface)).toBe(true)
})
