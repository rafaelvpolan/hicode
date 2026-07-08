import { test, expect } from 'bun:test'
import { extractVerdictJson } from '../lib/runner/codefox-gate'

test('extrai o ultimo JSON de veredito valido em meio a prosa', () => {
  const t = 'analise... {"foo":1} veredito: {"verdict":"BLOCKED","reason":"bug real","questions":["q1","q2"]}'
  const v = extractVerdictJson(t)
  expect(v?.verdict).toBe('BLOCKED')
  expect(v?.reason).toBe('bug real')
})

test('devolve null quando nao ha veredito', () => {
  expect(extractVerdictJson('sem json aqui {"foo":1}')).toBeNull()
})

test('respeita chaves dentro de strings', () => {
  const v = extractVerdictJson('{"verdict":"APPROVED","reason":"tem } e { na string"}')
  expect(v?.verdict).toBe('APPROVED')
})
