import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-pergunta-'))
  mkdirSync(join(dir, 'runs'), { recursive: true })
  process.env.HICODE_CARDS_DIR = dir
  writeFileSync(join(dir, '024-x.md'),
    '---\nid: 024\nstatus: CLARIFY\ntitle: corrija todos os itens\nrepo: org/app\n---\n## Objetivo\ncorrija todos os itens\n')
  writeFileSync(join(dir, 'runs', '024.clarify.json'), JSON.stringify([
    { q: 'A lista de todos os itens a corrigir vem de onde?', options: ['do card', 'de um arquivo'], recommended: 'do card' },
  ]))
})

test('REGRESSAO a pergunta da IA NAO fica no rodape — ela sobe para cima do prompt', async () => {
  const { rodapeDa } = await import('../bin/lib/rodape-tui')
  const { newSession, perguntando } = await import('../lib/core/session')
  const linhas = rodapeDa(perguntando(newSession('org/app'), '024'), true)
  expect(linhas.join(' ')).not.toContain('vem de onde')
})

test('o renderizador da pergunta continua marcando a opcao escolhida pela seta', async () => {
  const { renderOpcoesRodape } = await import('../lib/core/render/clarify')
  const { pendencia } = await import('../lib/core/responder')
  const p = pendencia('024')
  expect(p).toBeTruthy()
  if (!p) return
  const texto = renderOpcoesRodape(p, { color: false, width: 76, selecionado: 'op:2' }).join('\n')
  expect(texto).toContain('vem de onde')
  expect(texto).toContain('do card')
  expect(texto).toContain('sugerido')
  expect(texto.split('\n')[2]).toContain('›')
})

test('o que vai ACIMA do prompt e desenhado acima da linha de entrada', async () => {
  const { renderFrame } = await import('../lib/core/tui/layout')
  const f = renderFrame({
    rows: 20, cols: 80, header: 'hii', corpo: ['log'], input: 'minha resposta', cursor: 3,
    dica: '', prompt: '› ', rodape: ['gasto hoje'],
    sugestoes: ['  ? #024 pergunta  A lista de todos os itens...'],
  })
  const linhas = f.lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''))
  const daPergunta = linhas.findIndex(l => l.includes('#024 pergunta'))
  const doPrompt = linhas.findIndex(l => l.includes('minha resposta'))
  const doRodape = linhas.findIndex(l => l.includes('gasto hoje'))
  expect(daPergunta).toBeGreaterThanOrEqual(0)
  expect(daPergunta).toBeLessThan(doPrompt)
  expect(doPrompt).toBeLessThan(doRodape)
})
