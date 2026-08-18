import { test, expect } from 'bun:test'
import { parseLinha, parseLog, classificar, formatar, agentesUsados, ultimoAgente, resumo } from '../lib/core/activity'

test('Task vira agente com o subagent_type', () => {
  const a = parseLinha('  → Task({"subagent_type":"vitro","description":"criar o selo"})')
  expect(a?.tipo).toBe('agente')
  expect(a?.nome).toBe('vitro')
  expect(a?.alvo).toBe('criar o selo')
})

test('Skill vira skill com o nome', () => {
  const a = parseLinha('  → Skill({"skill":"frontend-design","args":"hero"})')
  expect(a?.tipo).toBe('skill')
  expect(a?.nome).toBe('frontend-design')
})

test('Read/Edit/Write viram arquivo, mostrando so o fim do caminho', () => {
  const a = parseLinha('  → Edit({"file_path":"/home/user/projeto/src/components/App.vue"})')
  expect(a?.tipo).toBe('arquivo')
  expect(a?.nome).toBe('edit')
  expect(a?.alvo).toBe('components/App.vue')
})

test('Bash vira shell com o comando', () => {
  const a = parseLinha('  → Bash({"command":"npm run build"})')
  expect(a?.tipo).toBe('shell')
  expect(a?.alvo).toBe('npm run build')
})

test('Grep e Glob viram busca', () => {
  expect(parseLinha('  → Grep({"pattern":"badge"})')?.tipo).toBe('busca')
  expect(parseLinha('  → Glob({"pattern":"src/**/*.vue"})')?.tipo).toBe('busca')
})

test('ferramenta MCP mostra servidor e metodo', () => {
  const a = parseLinha('  → mcp__playwright__browser_navigate({"url":"http://x"})')
  expect(a?.tipo).toBe('mcp')
  expect(a?.nome).toBe('playwright')
  expect(a?.alvo).toBe('browser_navigate')
})

test('REGRESSAO entrada truncada com … ainda extrai o campo', () => {
  const a = parseLinha('  → Task({"subagent_type":"escudo","prompt":"revise a seguranca do di…')
  expect(a?.nome).toBe('escudo')
})

test('JSON invalido cai no fallback por regex, sem lancar', () => {
  const a = parseLinha('  → Read({file_path: sem quotes})')
  expect(a?.tipo).toBe('arquivo')
})

test('sessao e conclusao viram marcos', () => {
  expect(parseLinha('— sessao iniciada (claude-opus-5) —')).toMatchObject({ tipo: 'sessao', alvo: 'claude-opus-5' })
  expect(parseLinha('— concluido (custo $1.2345) —')).toMatchObject({ tipo: 'fim', alvo: 'US$1.2345' })
  expect(parseLinha('— TIMEOUT: encerrando a IA —')).toMatchObject({ tipo: 'fim', nome: 'timeout' })
})

test('resultado de ferramenta (←) e descartado do timeline', () => {
  expect(parseLinha('  ← {"ok":true}')).toBeNull()
})

test('linha vazia nao gera atividade', () => {
  expect(parseLinha('   ')).toBeNull()
})

test('texto do modelo entra como texto', () => {
  const a = parseLinha('Vou adicionar o selo ao lado do badge existente.')
  expect(a?.tipo).toBe('texto')
  expect(a?.alvo).toContain('selo ao lado')
})

test('parseLog processa o log inteiro na ordem', () => {
  const log = [
    '— sessao iniciada (opus) —',
    '  → Task({"subagent_type":"vitro"})',
    '  ← ok',
    '  → Edit({"file_path":"src/App.vue"})',
    '  → Task({"subagent_type":"frontiteto"})',
    '— concluido (custo $0.50) —',
  ].join('\n')
  const at = parseLog(log)
  expect(at.map(a => a.tipo)).toEqual(['sessao', 'agente', 'arquivo', 'agente', 'fim'])
})

test('agentesUsados sem repetir, e ultimoAgente e o mais recente', () => {
  const at = parseLog([
    '  → Task({"subagent_type":"vitro"})',
    '  → Task({"subagent_type":"vitro"})',
    '  → Task({"subagent_type":"crivo"})',
  ].join('\n'))
  expect(agentesUsados(at)).toEqual(['vitro', 'crivo'])
  expect(ultimoAgente(at)).toBe('crivo')
})

test('resumo conta agentes, skills, arquivos, comandos e buscas', () => {
  const at = parseLog([
    '  → Task({"subagent_type":"vitro"})',
    '  → Skill({"skill":"frontend-design"})',
    '  → Edit({"file_path":"a.vue"})',
    '  → Edit({"file_path":"b.vue"})',
    '  → Bash({"command":"npm test"})',
    '  → Grep({"pattern":"x"})',
  ].join('\n'))
  const r = resumo(at)
  expect(r).toContain('vitro')
  expect(r).toContain('1 skill(s)')
  expect(r).toContain('2 arquivo(s)')
  expect(r).toContain('1 comando(s)')
})

test('resumo de log sem ferramenta e vazio', () => {
  expect(resumo(parseLog('só texto do modelo aqui'))).toBe('')
})

test('formatar usa o estilo do CLI: bullet + Ferramenta(args)', () => {
  expect(formatar(classificar({ ferramenta: 'Task', entrada: { subagent_type: 'radix' } }))).toBe('● Task(radix)')
  expect(formatar(classificar({ ferramenta: 'Skill', entrada: { skill: 'spec' } }))).toBe('● Skill(spec)')
})

test('a prosa da IA chega inteira — cortar em 90 chars comia a resposta', () => {
  const frase = 'Nao consegui executar: o conector Notion esta conectado, mas bloqueado por permissao nesta sessao, '
    + 'e por isso nada foi criado no Notion nem alterado no worktree do card.'
  const a = parseLinha(frase)
  expect(a?.tipo).toBe('texto')
  expect(a?.alvo).toBe(frase)
  expect(a?.alvo.endsWith('…')).toBe(false)
})

test('entrada de ferramenta continua curta — o corte de 60 vale para tool, nao para prosa', () => {
  const a = parseLinha('  → Bash({"command":"' + 'x'.repeat(300) + '"})')
  expect(a?.tipo).toBe('shell')
  expect(a?.alvo.length).toBeLessThanOrEqual(61)
})
