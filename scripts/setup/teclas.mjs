const inp = process.stdin
const out = process.stdout

if (!inp.isTTY) {
  out.write('\n  precisa de um terminal de verdade — rode: hii teclas\n\n')
  process.exit(1)
}

const TECLAS_ON = '\x1b[>4;2m\x1b[>1u'
const TECLAS_OFF = '\x1b[<u\x1b[>4;0m'

out.write('\n  Aperte as teclas para ver o que o seu terminal manda.\n')
out.write('  Teste: shift+enter, ctrl+j, enter, ctrl+backspace.\n')
out.write('  ctrl+c encerra.\n\n')
out.write(TECLAS_ON)

inp.setRawMode(true)
inp.resume()
inp.setEncoding('utf8')

const nome = (s) => {
  if (s === '\r') return 'ENTER (\\r)'
  if (s === '\n') return 'ctrl+j / LF (\\n)'
  if (s === '\x1b[13;2u') return 'shift+enter (CSI-u) — o hii ja quebra linha'
  if (s === '\x1b\r') return 'alt+enter — o hii ja quebra linha'
  if (s === '\x7f') return 'backspace'
  if (s === '\x08') return 'ctrl+backspace'
  if (s === '\x03') return 'ctrl+c'
  return ''
}

inp.on('data', (chunk) => {
  if (chunk === '\x03') {
    out.write(TECLAS_OFF)
    inp.setRawMode(false)
    out.write('\n  encerrado\n\n')
    process.exit(0)
  }
  const bytes = [...chunk].map((c) => {
    const n = c.codePointAt(0)
    return n < 32 || n === 127 ? '\\x' + n.toString(16).padStart(2, '0') : c
  }).join('')
  const rotulo = nome(chunk)
  out.write(`  ${bytes.padEnd(24)} ${rotulo}\n`)
})
