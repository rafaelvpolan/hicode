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

const QUEBRAM = ['\x1b[13;2u', '\x1b\r', '\x1b[27;2;13~', '\x1b[13;5u', '\x1b[27;5;13~']
const APAGAM = ['\x08', '\x00', '\x17', '\x1b\x7f', '\x1b[27;5;8~', '\x1b[8;5u']
let viuQuebra = false

const nome = (s) => {
  if (QUEBRAM.includes(s)) { viuQuebra = true; return 'shift/alt+enter — o hii quebra linha com isso' }
  if (s === '\r') return 'ENTER (\\r) — se isso apareceu no shift+enter, o terminal nao distingue'
  if (s === '\n') return 'ctrl+j (\\n) — o hii quebra linha com isso'
  if (APAGAM.includes(s)) return 'apagar palavra — o hii ja entende'
  if (s === '\x7f') return 'backspace'
  if (s === '\x03') return 'ctrl+c'
  return 'sem uso no hii'
}

const veredito = () => {
  if (viuQuebra) return '\n  shift+enter funciona no hii.\n'
  return [
    '',
    '  Seu terminal manda o MESMO byte no shift+enter e no enter,',
    '  entao nenhum programa consegue distinguir os dois.',
    '',
    '  Use ctrl+j para quebrar linha — funciona sempre.',
    '',
    '  Ou ensine o Windows Terminal a mandar uma sequencia propria:',
    '  Configuracoes > Abrir arquivo JSON, e em "actions" adicione:',
    '',
    '    {',
    '      "command": { "action": "sendInput", "input": "\\u001b[27;2;13~" },',
    '      "keys": "shift+enter"',
    '    }',
    '',
    '  Salve, reabra o terminal, e o shift+enter passa a quebrar linha no hii.',
    '',
  ].join('\n')
}

inp.on('data', (chunk) => {
  if (chunk === '\x03') {
    out.write(TECLAS_OFF)
    inp.setRawMode(false)
    out.write(veredito())
    process.exit(0)
  }
  const bytes = [...chunk].map((c) => {
    const n = c.codePointAt(0)
    return n < 32 || n === 127 ? '\\x' + n.toString(16).padStart(2, '0') : c
  }).join('')
  const rotulo = nome(chunk)
  out.write(`  ${bytes.padEnd(24)} ${rotulo}\n`)
})
