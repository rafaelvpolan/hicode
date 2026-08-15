import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const color = process.stdout.isTTY && !process.env.NO_COLOR
const out = (s) => process.stdout.write(s + '\n')
const dim = (s) => (color ? DIM + s + RESET : s)

const SEQUENCIA = '\\u001b[27;2;13~'

function acharSettings() {
  const base = '/mnt/c/Users'
  if (!existsSync(base)) return ''
  const cauda = [
    'AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json',
    'AppData/Local/Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json',
    'AppData/Local/Microsoft/Windows Terminal/settings.json',
  ]
  for (const usuario of readdirSync(base)) {
    for (const c of cauda) {
      const f = join(base, usuario, c)
      if (existsSync(f)) return f
    }
  }
  return ''
}

function semComentarios(raw) {
  return raw.replace(/^\s*\/\/.*$/gm, '')
}

const alvo = process.argv[2] || acharSettings()

if (!alvo) {
  out('')
  out('  nao achei o settings.json do Windows Terminal')
  out(dim('  passe o caminho: hii teclas --corrigir <caminho>'))
  out('')
  process.exit(1)
}

out('')
out(`  arquivo   ${alvo}`)

let raw = ''
try {
  raw = readFileSync(alvo, 'utf8').replace(/^﻿/, '')
} catch (e) {
  out(`  nao consegui ler: ${e.message}`)
  out('')
  process.exit(1)
}

let atual = null
try {
  atual = JSON.parse(semComentarios(raw))
} catch (e) {
  out(`  o arquivo nao e JSON valido (${e.message}) — nao vou mexer`)
  out('')
  process.exit(1)
}

const jaTem = (atual.actions ?? []).some(
  (a) => typeof a?.keys === 'string' && a.keys.toLowerCase() === 'shift+enter',
)
if (jaTem) {
  out('  shift+enter ja esta configurado — nada a fazer')
  out(dim('  se ainda nao funciona, feche e reabra o Windows Terminal'))
  out('')
  process.exit(0)
}

const bloco = `"actions": [
        {
            "command":
            {
                "action": "sendInput",
                "input": "${SEQUENCIA}"
            },
            "keys": "shift+enter"
        }
    ],`

const vazio = /"actions"\s*:\s*\[\s*\]\s*,/
const comItens = /"actions"\s*:\s*\[/

let novo = ''
if (vazio.test(raw)) {
  novo = raw.replace(vazio, bloco)
} else if (comItens.test(raw)) {
  novo = raw.replace(
    comItens,
    `"actions": [
        {
            "command":
            {
                "action": "sendInput",
                "input": "${SEQUENCIA}"
            },
            "keys": "shift+enter"
        },`,
  )
} else {
  out('  nao achei o campo "actions" — nao vou adivinhar onde inserir')
  out('')
  process.exit(1)
}

try {
  JSON.parse(semComentarios(novo))
} catch (e) {
  out(`  a edicao quebraria o JSON (${e.message}) — abortado, nada foi escrito`)
  out('')
  process.exit(1)
}

const backup = `${alvo}.bak-hii`
copyFileSync(alvo, backup)
writeFileSync(alvo, novo)

out(`  backup    ${backup}`)
out('  pronto — shift+enter agora manda \\u001b[27;2;13~')
out('')
out(dim('  feche e reabra o Windows Terminal, depois teste com: hii teclas'))
out('')
