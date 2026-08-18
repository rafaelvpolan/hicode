import { test, expect } from 'bun:test'
import { renderHelp } from '../lib/core/render/help'
import { stripAnsi, visibleLen } from '../lib/core/tui/layout'

test('agrupa por proposito, nao numa lista solta', () => {
  const t = renderHelp().join('\n')
  for (const secao of ['comecar', 'acompanhar', 'decidir', 'projeto', 'teclas']) {
    expect(t).toContain(secao)
  }
})

test('cobre todos os comandos que a sessao aceita', () => {
  const t = renderHelp().join('\n')
  for (const c of ['/board', '/config', '/ask', '/stop', '/rm', '/repo', '/exit', '/new-task', '/new-ask', '/new-session']) {
    expect(t).toContain(c)
  }
})

test('todo comando que o /help anuncia e aceito pelo parser', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const texto = renderHelp().join('\n')
  const anunciados = [...new Set([...texto.matchAll(/(?:^|\s)(\/[a-z?-]+)/gm)].map(m => m[1] ?? ''))]
  expect(anunciados.length).toBeGreaterThan(8)
  for (const cmd of anunciados) {
    expect(handle(`${cmd} 001`, newSession('org/app')).effect.kind, cmd).not.toBe('error')
  }
})

test('ensina o que nao e comando: texto livre, numero e enter', () => {
  const t = renderHelp().join('\n')
  expect(t).toContain('vira tarefa')
  expect(t).toContain('abre o plano')
  expect(t).toContain('aprova o plano')
})

test('descricoes alinham na mesma coluna', () => {
  const linhas = renderHelp({ width: 78 }).filter(l => l.startsWith('    /'))
  const colunas = new Set(linhas.map(l => l.indexOf('  ', 5)))
  const inicios = linhas.map(l => l.length - l.trimStart().length)
  expect(new Set(inicios).size).toBe(1)
  expect(colunas.size).toBeGreaterThan(0)
})

test('com cor, a coluna continua alinhada (escape nao conta)', () => {
  const semCor = renderHelp({ width: 78, color: false }).filter(l => l.includes('/stop'))
  const comCor = renderHelp({ width: 78, color: true }).filter(l => l.includes('/stop'))
  expect(stripAnsi(comCor[0] ?? '')).toBe(semCor[0] ?? '')
})

test('sem cor nao emite escape ANSI', () => {
  expect(renderHelp({ color: false }).join('')).not.toContain('\x1b[')
})

test('cabe na largura pedida, mesmo em terminal estreito', () => {
  for (const width of [40, 60, 78, 120]) {
    for (const l of renderHelp({ width, color: false })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('avisa quantas tarefas esperam e por onde comecar', () => {
  const t = renderHelp({ esperando: 4, primeiroComando: '/ask 22' }).join('\n')
  expect(t).toContain('4 tarefas esperam por voce')
  expect(t).toContain('comece por /ask 22')
})

test('uma tarefa esperando fala no singular', () => {
  expect(renderHelp({ esperando: 1 }).join('\n')).toContain('1 tarefa espera')
})

test('sem nada esperando, nao inventa aviso', () => {
  expect(renderHelp({ esperando: 0 }).join('\n')).not.toContain('espera')
})

test('mostra o projeto atual no cabecalho, e omite quando nao ha', () => {
  expect(renderHelp({ repo: 'org/app' })[1]).toContain('org/app')
  expect(renderHelp({ repo: '' })[1]?.trim()).toBe('hii')
})

test('mostra o caminho da tarefa, do inicio ao PR', () => {
  const t = renderHelp().join('\n')
  expect(t).toContain('Fila')
  expect(t).toContain('Preview')
  expect(t).toContain('PR')
})
