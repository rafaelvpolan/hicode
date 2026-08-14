import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../lib/core/tui/app'
import { handle, newSession, planShown, respondido } from '../lib/core/session'
import { dispatch } from '../lib/core/dispatch'
import type { Terminal } from '../lib/core/tui/screen'
import type { SessionState } from '../lib/core/session'
import { stripAnsi } from '../lib/core/tui/layout'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-tui-'))
  mkdirSync(join(dir, 'runs'), { recursive: true })
  process.env.HICODE_CARDS_DIR = dir
})

function card(id: string, fields: Record<string, string> = {}): void {
  const fm = Object.entries({ id, status: 'READY', title: `tarefa ${id}`, repo: 'org/app', ...fields })
    .map(([k, v]) => `${k}: ${v}`).join('\n')
  writeFileSync(join(dir, `${id}-x.md`), `---\n${fm}\n---\n## Objetivo\nx\n`)
}

interface Fake extends Terminal {
  tecla: (k: string) => void
  saida: string[]
}

function fakeTerminal(): Fake {
  const saida: string[] = []
  let onKeyFn: ((k: string) => void) | null = null
  return {
    saida,
    write: (s) => { saida.push(s) },
    rows: () => 24,
    cols: () => 80,
    onResize: () => {},
    offResize: () => {},
    onKey: (fn) => { onKeyFn = fn },
    offKey: () => { onKeyFn = null },
    setRaw: () => {},
    tecla: (k) => onKeyFn?.(k),
  }
}

async function sessao(teclas: string[]): Promise<{ saida: string; state: SessionState }> {
  const term = fakeTerminal()
  let state = newSession('org/app')
  const registro: string[] = []
  const app = createApp(term, {
    header: () => 'hii',
    corpo: () => [],
    dica: () => '',
    prompt: () => '› ',
    rodape: () => [],
    intervalMs: 100000,
    onComplete: () => [],
    onInterrupt: () => true,
    onNav: () => false,
    onEntrar: () => {},
    onLine: async (linha) => {
      const r = handle(linha, state)
      state = r.state
      if (r.effect.kind === 'submit') {
        registro.push(`SUBMIT: ${r.effect.text}`)
        state = planShown(state, '999')
        return
      }
      const d = await dispatch(r.effect, state, {
        log: (l) => { registro.push(l); app.log(l) },
        dim: (t) => t,
        color: false,
        largura: () => 78,
        plano: async () => [],
        atividade: () => [],
      })
      state = d.state
    },
  })
  const rodando = app.run()
  for (const t of teclas) {
    for (const c of t) term.tecla(c)
    term.tecla('\r')
  }
  await new Promise(r => setTimeout(r, 20))
  term.tecla('\x03')
  await rodando
  return { saida: registro.join('\n'), state }
}

test('FLUXO TUI: /rm mais s apaga o card de verdade', async () => {
  card('027')
  const { saida } = await sessao(['/rm 27', 's'])
  expect(saida).toContain('apagar 1 tarefa')
  expect(saida).toContain('apagada(s)')
  expect(existsSync(join(dir, '027-x.md'))).toBe(false)
})

test('FLUXO TUI: enter confirma a remocao', async () => {
  card('027')
  const { saida } = await sessao(['/rm 27', ''])
  expect(saida).not.toContain('SUBMIT')
  expect(existsSync(join(dir, '027-x.md'))).toBe(false)
})

test('FLUXO TUI: n cancela e o card fica', async () => {
  card('027')
  const { saida } = await sessao(['/rm 27', 'n'])
  expect(saida).toContain('cancelado')
  expect(existsSync(join(dir, '027-x.md'))).toBe(true)
})

test('FLUXO TUI: /rm de card ausente nao deixa estado preso', async () => {
  const { state } = await sessao(['/rm 99'])
  expect(state.removendo).toBe('')
})

test('FLUXO TUI: erro dentro do onLine aparece na tela', async () => {
  const term = fakeTerminal()
  const app = createApp(term, {
    header: () => 'hii',
    corpo: () => [],
    dica: () => '',
    prompt: () => '› ',
    rodape: () => [],
    intervalMs: 100000,
    onComplete: () => [],
    onInterrupt: () => true,
    onNav: () => false,
    onEntrar: () => {},
    onLine: async () => { throw new Error('explodiu de proposito') },
  })
  const rodando = app.run()
  term.tecla('x')
  term.tecla('\r')
  await new Promise(r => setTimeout(r, 10))
  term.tecla('\x03')
  await rodando
  expect(stripAnsi(term.saida.join(''))).toContain('explodiu de proposito')
})

test('REGRESSAO corrida: linhas coladas de uma vez nao perdem o estado', async () => {
  card('027')
  card('028')
  const { saida } = await sessao(['/rm 27 28', 's'])
  expect(saida).not.toContain('SUBMIT')
  expect(existsSync(join(dir, '027-x.md'))).toBe(false)
  expect(existsSync(join(dir, '028-x.md'))).toBe(false)
})

test('REGRESSAO corrida: varios comandos em sequencia rapida mantem o estado', async () => {
  card('027')
  card('028')
  const { saida } = await sessao(['/cards', '/rm 27', 's', '/rm 28', 's'])
  expect(saida).not.toContain('SUBMIT')
  expect(existsSync(join(dir, '027-x.md'))).toBe(false)
  expect(existsSync(join(dir, '028-x.md'))).toBe(false)
})
