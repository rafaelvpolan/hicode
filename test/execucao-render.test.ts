import { test, expect } from 'bun:test'
import { parseLog, classificar, ehProsa } from '../lib/core/activity'
import { renderExecucao, linhasDaAtividade, chamadaDe } from '../lib/core/render/execucao'
import { renderFrame } from '../lib/core/tui/layout'

const semCor = { color: false }

test('resultado da ferramenta (←) vira linha ⎿ ligada a chamada anterior', () => {
  const at = parseLog('  → Bash({"command":"npm test"})\n  ← 1208 pass 0 fail')
  expect(at).toHaveLength(1)
  expect(at[0]?.resultado).toBe('1208 pass 0 fail')
  expect(renderExecucao(at, semCor)).toEqual(['● Bash(npm test)', '  ⎿ 1208 pass 0 fail'])
})

test('resultado NAO cola em prosa nem em marco', () => {
  const at = parseLog('— sessao iniciada (opus) —\n  ← lixo')
  expect(at[0]?.resultado).toBeUndefined()
})

test('MCP com hifen no metodo e parseado — o regex antigo parava no hifen', () => {
  const at = parseLog('  → mcp__claude_ai_Notion__notion-search({"query":"FASE 3"})')
  expect(at[0]?.tipo).toBe('mcp')
  expect(at[0]?.alvo).toBe('notion-search')
  expect(renderExecucao(at, semCor)[0]).toBe('● notion-search(FASE 3)')
})

test('JSON truncado no meio da string ainda extrai o comando', () => {
  const at = parseLog('  → Bash({"command":"ls /home/rpolan/projects/podium/.hicode-worktrees/cash…)')
  expect(at[0]?.alvo).toContain('ls /home/rpolan/projects')
})

test('barra invertida escapada nao vaza para a tela', () => {
  const at = parseLog('  → Bash({"command":"git check-ignore -v x; echo \\"exit=$?\\""})')
  expect(at[0]?.alvo).not.toContain('\\')
})

test('prosa de varias linhas fica sob um unico bullet', () => {
  const at = parseLog('Nao consegui executar.\nO conector esta bloqueado.')
  expect(at).toHaveLength(1)
  expect(ehProsa(at[0]!)).toBe(true)
  expect(renderExecucao(at, semCor)).toEqual(['● Nao consegui executar.', '  O conector esta bloqueado.'])
})

test('linha em branco preserva a quebra de paragrafo dentro do bullet', () => {
  const at = parseLog('primeiro paragrafo\n\nsegundo paragrafo')
  expect(renderExecucao(at, semCor)).toEqual(['● primeiro paragrafo', '  ', '  segundo paragrafo'])
})

test('chamada em + sessao iniciada viram UM marco com modelo e hora', () => {
  const at = parseLog('— chamada em 2026-08-17T15:19:13Z —\n— sessao iniciada (claude-opus-5[1m]) —')
  expect(at).toHaveLength(1)
  expect(renderExecucao(at, semCor)).toEqual(['◇ claude-opus-5[1m] · 15:19:13'])
})

test('falha no resultado ganha cor de erro; sucesso fica dim', () => {
  const erro = linhasDaAtividade({ tipo: 'shell', nome: 'bash', alvo: 'x', ts: '', resultado: 'permission denied' }, { color: true })
  const ok = linhasDaAtividade({ tipo: 'shell', nome: 'bash', alvo: 'x', ts: '', resultado: 'tudo certo' }, { color: true })
  expect(erro[1]).toContain('\x1b[31m')
  expect(ok[1]).not.toContain('\x1b[31m')
})

test('nome da ferramenta capitalizado como no CLI', () => {
  expect(chamadaDe(classificar({ ferramenta: 'Read', entrada: { file_path: '/a/b/c.ts' } }))).toBe('Read(b/c.ts)')
  expect(chamadaDe(classificar({ ferramenta: 'Grep', entrada: { pattern: 'selo' } }))).toBe('Grep(selo)')
})

test('a regiao fixa NAO e comida pelo log que cresce', () => {
  const fixo = ['#023 executando', 'objetivo: criar task', '── processos ──']
  const corpo = Array.from({ length: 300 }, (_, i) => `linha ${i}`)
  const f = renderFrame({
    rows: 20, cols: 80, header: 'hii', fixo, corpo, input: '', cursor: 0,
    dica: 'dica', prompt: '› ', rodape: ['gasto'], legenda: 'projeto',
  })
  const texto = f.lines.join('\n')
  for (const l of fixo) expect(texto).toContain(l)
  expect(texto).toContain('linha 299')
  expect(f.lines.length).toBeLessThanOrEqual(20)
})

test('regiao fixa maior que a caixa cede espaco em vez de sumir com o log', () => {
  const fixo = Array.from({ length: 40 }, (_, i) => `fixo ${i}`)
  const f = renderFrame({
    rows: 14, cols: 80, header: 'hii', fixo, corpo: ['ultima do log'], input: '', cursor: 0,
    dica: '', prompt: '› ', rodape: [], legenda: 'projeto',
  })
  expect(f.lines.length).toBeLessThanOrEqual(14)
  expect(f.lines.join('\n')).toContain('ultima do log')
})

test('REGRESSAO chamadas paralelas: resultado vai para a chamada CERTA, em FIFO', () => {
  const at = parseLog([
    '  → Read({"file_path":"/a/UM.ts"})',
    '  → Read({"file_path":"/b/DOIS.ts"})',
    '  ← conteudo do UM',
    '  ← conteudo do DOIS',
  ].join('\n'))
  expect(at.map(a => a.resultado)).toEqual(['conteudo do UM', 'conteudo do DOIS'])
})

test('resultado sobrando nao vaza para chamada ja resolvida', () => {
  const at = parseLog('  → Read({"file_path":"/a/UM.ts"})\n  ← primeiro\n  ← sobra')
  expect(at[0]?.resultado).toBe('primeiro')
})

test('REGRESSAO: cabecalho pinado NAO pode esconder a confirmacao no rodape do log', () => {
  const painel = [
    '  ── apagar 1 tarefa ──',
    '    #023  preview   US$1.47',
    '',
    '  enter confirma · n cancela',
  ]
  const fixo = Array.from({ length: 40 }, (_, i) => `cabecalho ${i}`)
  for (const rows of [10, 14, 18, 24, 30, 50]) {
    const f = renderFrame({
      rows, cols: 80, header: 'hii', fixo, corpo: painel, input: '', cursor: 0,
      dica: 'dica', prompt: '› ', rodape: ['gasto'], legenda: 'projeto · tarefa #023',
    })
    const tela = f.lines.join('\n')
    expect(tela).toContain('enter confirma')
    expect(f.lines.length).toBeLessThanOrEqual(rows)
  }
})

test('regiao pinada cede espaco ao log, nunca o contrario', () => {
  const fixo = Array.from({ length: 100 }, (_, i) => `f${i}`)
  const corpo = Array.from({ length: 100 }, (_, i) => `log ${i}`)
  const f = renderFrame({
    rows: 24, cols: 60, header: 'h', fixo, corpo, input: '', cursor: 0,
    dica: '', prompt: '› ', rodape: [], legenda: 'p',
  })
  const tela = f.lines.join('\n')
  expect(tela).toContain('f0')
  expect(tela).toContain('log 99')
})

test('REGRESSAO: plano de 19 linhas aparece de verdade, mesmo dentro de tarefa', () => {
  const plano = [
    'PLANO · card #023   perfil enxuto', '',
    '    Objetivo   criar task no notion', '    Alvo       org/app', '',
    '── Realizacao ──', '    1. Limpeza        pura', '',
    '    pula Arquitetura, Testes, Seguranca, Review', '',
    '── Execucao ──', '    enter aprova · /ok aprova o preview', '', '    Nada foi executado.',
  ]
  const fixo = Array.from({ length: 20 }, (_, i) => `cabecalho ${i}`)
  const f = renderFrame({
    rows: 30, cols: 80, header: 'hii', fixo, corpo: plano, input: '', cursor: 0,
    dica: 'dica', prompt: '› ', rodape: ['gasto'], legenda: 'org/app · #023',
  })
  const tela = f.lines.join('\n')
  expect(tela).toContain('Realizacao')
  expect(tela).toContain('Nada foi executado')
  expect(tela).toContain('cabecalho 0')
  expect(f.lines.length).toBeLessThanOrEqual(30)
})

test('a regiao pinada nunca passa de 40% da caixa', () => {
  const pinado = Array.from({ length: 200 }, (_, i) => `p${i}`)
  for (const rows of [14, 20, 24, 30, 40, 60]) {
    const f = renderFrame({
      rows, cols: 60, header: 'h', fixo: pinado, corpo: ['ultima'], input: '', cursor: 0,
      dica: '', prompt: '› ', rodape: [], legenda: 'p',
    })
    const dentro = f.lines.filter(l => l.startsWith('  │')).length
    const pinadas = f.lines.filter(l => /│p\d+/.test(l)).length
    expect(pinadas).toBeLessThanOrEqual(Math.ceil(dentro * 0.4))
    expect(f.lines.join('\n')).toContain('ultima')
  }
})
