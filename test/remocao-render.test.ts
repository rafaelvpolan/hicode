import { test, expect } from 'bun:test'
import { renderRemocao, renderResultado } from '../lib/core/render/remocao'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'
import type { PlanoLote, PlanoRemocao } from '../lib/core/remover'

function plano(over: Partial<PlanoRemocao> = {}): PlanoRemocao {
  return {
    id: '023', titulo: 'tarefa qualquer', status: 'READY', repo: 'org/app',
    branch: '', worktree: '', previewPid: '', runs: [], bloqueio: '', avisos: [], custo: '', piso: '',
    ...over,
  }
}

function lote(over: Partial<PlanoLote> = {}): PlanoLote {
  return { removiveis: [], bloqueados: [], ausentes: [], ...over }
}

test('cabe em qualquer largura, do estreito ao largo', () => {
  const l = lote({
    removiveis: [
      plano({ id: '023', titulo: 'a'.repeat(120), custo: '2.3665', worktree: '/x', previewPid: '9', runs: ['a', 'b'] }),
      plano({ id: '037', titulo: 'outra bem longa tambem para testar', status: 'PR_OPEN', branch: 'hicode/037' }),
    ],
    bloqueados: [plano({ id: '041', status: 'EXECUTING', bloqueio: 'em voo' })],
    ausentes: ['099'],
  })
  for (const width of [40, 50, 62, 78, 120]) {
    for (const linha of renderRemocao(l, false, { width })) {
      expect(visibleLen(linha)).toBeLessThanOrEqual(width)
    }
  }
})

test('mostra o que sera limpo por card', () => {
  const t = renderRemocao(lote({
    removiveis: [plano({ worktree: '/x', previewPid: '9', runs: ['a', 'b', 'c'] })],
  }), false, { width: 78 }).join('\n')
  expect(t).toContain('worktree')
  expect(t).toContain('preview')
  expect(t).toContain('3 logs')
})

test('um log so nao vira plural', () => {
  const t = renderRemocao(lote({ removiveis: [plano({ runs: ['a'] })] }), false, { width: 78 }).join('\n')
  expect(t).toContain('1 log')
  expect(t).not.toContain('1 logs')
})

test('soma o custo ja gasto nas tarefas que vao sumir', () => {
  const t = renderRemocao(lote({
    removiveis: [plano({ id: '1', custo: '2.3665' }), plano({ id: '2', custo: '0.3100' })],
  }), false, { width: 78 }).join('\n')
  expect(t).toContain('US$2.68 ja gastos')
})

test('avisa que as branches ficam, no plural certo', () => {
  const uma = renderRemocao(lote({ removiveis: [plano({ branch: 'x' })] }), false, {}).join('\n')
  const duas = renderRemocao(lote({
    removiveis: [plano({ id: '1', branch: 'x' }), plano({ id: '2', branch: 'y' })],
  }), false, {}).join('\n')
  expect(uma).toContain('1 branch fica')
  expect(duas).toContain('2 branches ficam')
})

test('avisa quando um PR aberto vai ficar orfao', () => {
  const t = renderRemocao(lote({ removiveis: [plano({ status: 'PR_OPEN' })] }), false, {}).join('\n')
  expect(t).toContain('1 PR fica aberto')
})

test('separa o que nao existe do que esta em voo', () => {
  const t = renderRemocao(lote({
    removiveis: [plano()],
    bloqueados: [plano({ id: '041', status: 'EXECUTING' })],
    ausentes: ['099'],
  }), false, { width: 78 }).join('\n')
  expect(t).toContain('#099 nao existe')
  expect(t).toContain('#041 em EXECUTING, fica')
})

test('com force, o card em voo entra na lista de apagar', () => {
  const l = lote({ bloqueados: [plano({ id: '041', status: 'EXECUTING' })] })
  expect(renderRemocao(l, true, {}).join('\n')).toContain('apagar 1 tarefa')
  expect(renderRemocao(l, false, {}).join('\n')).toContain('nada a apagar')
})

test('sem alvo, explica por que e nao pede confirmacao', () => {
  const t = renderRemocao(lote({ ausentes: ['099'] }), false, {}).join('\n')
  expect(t).toContain('nada a apagar')
  expect(t).not.toContain('enter confirma')
})

test('diz qual tecla confirma e qual cancela', () => {
  const t = renderRemocao(lote({ removiveis: [plano()] }), false, {}).join('\n')
  expect(t).toContain('enter confirma')
  expect(t).toContain('n cancela')
})

test('singular e plural no titulo do painel', () => {
  expect(renderRemocao(lote({ removiveis: [plano()] }), false, {}).join('\n')).toContain('apagar 1 tarefa')
  expect(renderRemocao(lote({
    removiveis: [plano({ id: '1' }), plano({ id: '2' })],
  }), false, {}).join('\n')).toContain('apagar 2 tarefas')
})

test('sem cor nao emite escape ANSI', () => {
  const t = renderRemocao(lote({ removiveis: [plano({ custo: '1.00' })] }), false, { color: false })
  expect(t.join('')).not.toContain('\x1b[')
})

test('com cor, o conteudo visivel e o mesmo', () => {
  const l = lote({ removiveis: [plano({ custo: '1.00', worktree: '/x' })] })
  const semCor = renderRemocao(l, false, { color: false, width: 78 })
  const comCor = renderRemocao(l, false, { color: true, width: 78 }).map(stripAnsi)
  expect(comCor).toEqual(semCor)
})

test('titulo longo nao encosta na coluna de custo', () => {
  const t = renderRemocao(lote({
    removiveis: [plano({ titulo: 'x'.repeat(200), custo: '2.37' })],
  }), false, { width: 78 })
  const linha = t.find(l => l.includes('US$')) ?? ''
  expect(linha).toMatch(/\s US\$/)
})

test('um card sem reporte de gasto transforma o total apagado em piso e nomeia o provedor', () => {
  const t = renderRemocao(lote({
    removiveis: [plano({ custo: '0.7726', piso: 'codex' }), plano({ id: '024', custo: '1.00' })],
  }), false, { width: 78 }).join('\n')
  expect(t).toContain('≥ US$1.77 ja gastos')
  expect(t).toContain('piso: codex sem reporte de gasto')
  expect(t).toContain('≥ US$0.77')
  expect(t).toContain(' US$1.00')
  expect(t).not.toContain('≥ US$1.00')
})

test('sem card marcado o total apagado sai afirmativo, como antes do marcador', () => {
  const t = renderRemocao(lote({ removiveis: [plano({ custo: '0.7726' })] }), false, { width: 78 })
  expect(t).toContain('    US$0.77 ja gastos')
  expect(t.join('\n')).not.toContain('≥')
  expect(t.join('\n')).not.toContain('piso')
})

test('o piso do lote junta os provedores dos cards apagados sem repetir', () => {
  const t = renderRemocao(lote({
    removiveis: [plano({ custo: '1.00', piso: 'codex' }), plano({ id: '024', custo: '1.00', piso: 'codex, claude' })],
  }), false, { width: 78 }).join('\n')
  expect(t).toContain('piso: codex, claude sem reporte de gasto')
})

test('card bloqueado que fica de fora nao empresta o piso dele ao total', () => {
  const t = renderRemocao(lote({
    removiveis: [plano({ custo: '1.00' })],
    bloqueados: [plano({ id: '041', status: 'EXECUTING', custo: '9.00', piso: 'codex' })],
  }), false, { width: 78 }).join('\n')
  expect(t).toContain('US$1.00 ja gastos')
  expect(t).not.toContain('piso:')
})

test('resultado lista o que foi e o que falhou', () => {
  const t = renderResultado(['023', '024'], [{ id: '041', reason: 'esta em EXECUTING' }], { width: 78 }).join('\n')
  expect(t).toContain('2 apagada(s)')
  expect(t).toContain('#023 #024')
  expect(t).toContain('#041 esta em EXECUTING')
})

test('resultado sem falha nao inventa linha de erro', () => {
  expect(renderResultado(['023'], [], {}).length).toBe(1)
})

test('resultado cabe na largura', () => {
  const t = renderResultado(Array.from({ length: 30 }, (_, i) => String(i)), [], { width: 50 })
  for (const l of t) expect(visibleLen(l)).toBeLessThanOrEqual(50)
})

test('fora do TUI, nao promete tecla que nao existe', () => {
  const t = renderRemocao(lote({ removiveis: [plano()] }), false, { confirmacao: false }).join('\n')
  expect(t).not.toContain('enter confirma')
  expect(t).toContain('apagar 1 tarefa')
})
