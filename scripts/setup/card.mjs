#!/usr/bin/env bun
import * as core from '../../lib/core/actions.ts'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const BAD = '\x1b[31m'
const tty = process.stdout.isTTY === true
const paint = (s, c) => (tty ? `${c}${s}${RESET}` : s)
const out = (s = '') => process.stdout.write(s + '\n')

function uso(code) {
  out('')
  out('  hii approve <id>              aprova o preview (PREVIEW -> PREVIEW_OK)')
  out('  hii approve <id> --plan       aprova o plano e enfileira (READY -> EXECUTING)')
  out('  hii reject <id> [o que]       rejeita o preview; com motivo, pede correcao')
  out('  hii halt <id> [motivo]        para o card')
  out('')
  out(paint('  o merge continua sendo humano, no GitHub — nem o motor nem o CLI mergeiam', DIM))
  out('')
  process.exit(code)
}

const argv = process.argv.slice(2)
const [acao, id] = argv
if (!acao || !id) uso(1)

const resto = argv.slice(2).filter((a) => a !== '--plan').join(' ')

let r
if (acao === 'approve') {
  r = argv.includes('--plan') ? core.approvePlan(id) : core.approvePreview(id)
} else if (acao === 'reject') {
  r = core.rejectPreview(id, resto)
} else if (acao === 'halt') {
  const feito = core.halt(id, resto || 'parado pelo humano')
  r = feito ? { ok: true, reason: '' } : { ok: false, reason: `card #${id} nao encontrado` }
} else {
  uso(1)
}

if (!r.ok) {
  out(`\n  ${paint(r.reason, BAD)}\n`)
  process.exit(1)
}
const estado = r.card?.status ?? ''
out(`\n  #${id} ${acao === 'reject' ? 'rejeitado' : acao === 'halt' ? 'parado' : 'aprovado'}${estado ? ` — agora em ${estado}` : ''}\n`)
